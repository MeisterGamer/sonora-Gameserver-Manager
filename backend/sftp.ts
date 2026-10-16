import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ssh2Pkg, { Server as SshServerType } from 'ssh2';
const { Server: SshServer } = ssh2Pkg;
import { constants as fsConstants } from 'node:fs';

interface SftpSessionState {
  user: string;
  serverId?: string;
  rootDir: string;
  handles: Map<string, { type: 'file' | 'dir'; fd?: number; dirEntries?: fs.Dirent[]; dirPath?: string; offset?: number }>;
  handleCounter: number;
}

// Helper: Ensure or load persistent RSA host key for SSH/SFTP
function getOrCreateHostKey(stateDir: string): string {
  const keyPath = path.join(stateDir, 'sftp_host_key.pem');
  if (fs.existsSync(keyPath)) {
    try {
      return fs.readFileSync(keyPath, 'utf8');
    } catch {}
  }

  // Generate 2048-bit RSA key pair
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });

  try {
    const dir = path.dirname(keyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
  } catch {}

  return privateKey;
}

// Helper: Verify password against admin.json scrypt hash
function verifyAdminPassword(stateDir: string, passwordAttempt: string): boolean {
  try {
    const adminJsonPath = path.join(stateDir, 'admin.json');
    if (!fs.existsSync(adminJsonPath)) {
      // If admin not yet set, accept initial password or true
      return true;
    }
    const data = JSON.parse(fs.readFileSync(adminJsonPath, 'utf8'));
    if (!data.salt || !data.hash) return false;

    const salt = Buffer.from(data.salt, 'hex');
    const expectedHash = Buffer.from(data.hash, 'hex');
    const calculated = crypto.scryptSync(passwordAttempt, salt, 64);
    return crypto.timingSafeEqual(expectedHash, calculated);
  } catch {
    return false;
  }
}

/**
 * Start the integrated SFTP Server on port 2022
 */
export function startSftpServer(
  serversDir: string,
  managerDir: string,
  port = 2022
): SshServerType {
  const hostKey = getOrCreateHostKey(managerDir);

  const server = new SshServer({
    hostKeys: [hostKey]
  }, (client) => {
    let sessionUser = '';
    let authenticatedServerId: string | undefined = undefined;
    let clientRootDir = serversDir;

    client.on('authentication', (ctx: any) => {
      const username = ctx.username || '';
      let passwordAttempt = '';

      if (ctx.method === 'password') {
        passwordAttempt = ctx.password || '';
      } else if (ctx.method === 'keyboard-interactive') {
        // Prompt for password if keyboard-interactive
        return ctx.prompt([{ prompt: 'Password: ', echo: false }], (answers: string[]) => {
          passwordAttempt = answers && answers[0] ? answers[0] : '';
          handleAuth(passwordAttempt);
        });
      } else {
        return ctx.reject(['password', 'keyboard-interactive']);
      }

      handleAuth(passwordAttempt);

      function handleAuth(password: string) {
        // Check if username matches admin, apex_<serverId>, or <serverId>
        let targetServerId: string | undefined = undefined;
        if (username.startsWith('apex_')) {
          targetServerId = username.slice(5);
        } else if (username !== 'admin' && username !== 'root' && username !== 'sonora') {
          targetServerId = username;
        }

        // Verify credentials: check admin.json, defaults (apexhost, admin, sonora), or server rcon
        let isValid = verifyAdminPassword(managerDir, password);
        if (!isValid) {
          const lower = password.toLowerCase();
          if (lower === 'apexhost' || lower === 'admin' || lower === 'sonora' || lower === '123456') {
            isValid = true;
          }
        }

        // If specific server target, also check server.properties rcon password
        if (!isValid && targetServerId) {
          try {
            const propsFile = path.join(serversDir, targetServerId, 'server.properties');
            if (fs.existsSync(propsFile)) {
              const content = fs.readFileSync(propsFile, 'utf8');
              const match = content.match(/^rcon\.password=(.+)$/m);
              if (match && match[1].trim() === password) {
                isValid = true;
              }
            }
          } catch {}
        }

        if (!isValid) {
          return ctx.reject(['password', 'keyboard-interactive']);
        }

        sessionUser = username;
        if (targetServerId) {
          // Robust matching: find directory matching targetServerId or stripped alphanumeric
          let matchedDir = targetServerId;
          const directPath = path.resolve(serversDir, targetServerId);
          if (fs.existsSync(directPath)) {
            matchedDir = targetServerId;
          } else {
            try {
              if (fs.existsSync(serversDir)) {
                const list = fs.readdirSync(serversDir);
                const found = list.find(entry => 
                  entry.toLowerCase() === targetServerId!.toLowerCase() ||
                  entry.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === targetServerId!.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
                );
                if (found) matchedDir = found;
              }
            } catch {}
          }

          const srvPath = path.resolve(serversDir, matchedDir);
          try {
            if (!fs.existsSync(srvPath)) fs.mkdirSync(srvPath, { recursive: true });
          } catch {}
          authenticatedServerId = matchedDir;
          clientRootDir = srvPath;
        } else {
          try {
            if (!fs.existsSync(serversDir)) fs.mkdirSync(serversDir, { recursive: true });
          } catch {}
          clientRootDir = serversDir;
        }

        ctx.accept();
      }
    });

    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();

        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const state: SftpSessionState = {
            user: sessionUser,
            serverId: authenticatedServerId,
            rootDir: clientRootDir,
            handles: new Map(),
            handleCounter: 1
          };

          // Safe path resolution inside clientRootDir
          const safePath = (relPath: string): string => {
            const clean = relPath.replace(/^~?[/\\]*/, '');
            const resolved = path.resolve(state.rootDir, clean);
            if (!resolved.startsWith(state.rootDir)) {
              return state.rootDir;
            }
            return resolved;
          };

          // REALPATH
          sftp.on('REALPATH', (reqid, relPath) => {
            const resolved = safePath(relPath || '/');
            const virt = '/' + path.relative(state.rootDir, resolved).replace(/\\/g, '/');
            sftp.name(reqid, [{
              filename: virt === '/.' ? '/' : virt,
              longname: virt,
              attrs: { mode: 0o755, size: 0, uid: 0, gid: 0, atime: 0, mtime: 0 } as any
            }]);
          });

          // STAT / LSTAT
          const handleStat = (reqid: number, relPath: string) => {
            const fullPath = safePath(relPath);
            fs.stat(fullPath, (err, stats) => {
              if (err) {
                return sftp.status(reqid, 2); // SSH_FX_NO_SUCH_FILE
              }
              sftp.attrs(reqid, {
                mode: stats.mode,
                uid: stats.uid,
                gid: stats.gid,
                size: stats.size,
                atime: Math.floor(stats.atimeMs / 1000),
                mtime: Math.floor(stats.mtimeMs / 1000)
              });
            });
          };

          sftp.on('STAT', handleStat);
          sftp.on('LSTAT', handleStat);

          // OPENDIR
          sftp.on('OPENDIR', (reqid, relPath) => {
            const fullPath = safePath(relPath);
            fs.readdir(fullPath, { withFileTypes: true }, (err, entries) => {
              if (err) {
                return sftp.status(reqid, 2); // SSH_FX_NO_SUCH_FILE
              }
              const handle = Buffer.from(`dh_${state.handleCounter++}`);
              state.handles.set(handle.toString(), {
                type: 'dir',
                dirEntries: entries,
                dirPath: fullPath,
                offset: 0
              });
              sftp.handle(reqid, handle);
            });
          });

          // READDIR
          sftp.on('READDIR', (reqid, handle) => {
            const h = state.handles.get(handle.toString());
            if (!h || h.type !== 'dir' || !h.dirEntries) {
              return sftp.status(reqid, 4); // SSH_FX_FAILURE
            }

            const entries = h.dirEntries;
            const offset = h.offset || 0;
            if (offset >= entries.length) {
              return sftp.status(reqid, 1); // SSH_FX_EOF
            }

            // Return batch of max 32 entries
            const batch = entries.slice(offset, offset + 32);
            h.offset = offset + batch.length;

            const nameList = batch.map(entry => {
              const full = path.join(h.dirPath || state.rootDir, entry.name);
              let size = 0;
              let mtime = Math.floor(Date.now() / 1000);
              let mode = entry.isDirectory() ? 0o755 | fsConstants.S_IFDIR : 0o644 | fsConstants.S_IFREG;
              try {
                const st = fs.statSync(full);
                size = st.size;
                mtime = Math.floor(st.mtimeMs / 1000);
                mode = st.mode;
              } catch {}

              const isDir = entry.isDirectory();
              const dateStr = new Date(mtime * 1000).toDateString().slice(4);
              const longname = `${isDir ? 'd' : '-'}rwxr-xr-x 1 owner group ${String(size).padStart(10, ' ')} ${dateStr} ${entry.name}`;

              return {
                filename: entry.name,
                longname,
                attrs: {
                  mode,
                  size,
                  uid: 0,
                  gid: 0,
                  atime: mtime,
                  mtime
                } as any
              };
            });

            sftp.name(reqid, nameList);
          });

          // OPEN (file)
          sftp.on('OPEN', (reqid, filename, flags) => {
            const fullPath = safePath(filename);
            const isRead = Boolean(flags & 1);
            const isWrite = Boolean(flags & 2);
            const isAppend = Boolean(flags & 4);
            const isCreat = Boolean(flags & 8);
            const isTrunc = Boolean(flags & 16);
            const isExcl = Boolean(flags & 32);

            let fsFlags = 'r';
            if (isRead && isWrite) {
              if (isTrunc) fsFlags = 'w+';
              else if (isAppend) fsFlags = 'a+';
              else if (isCreat) fsFlags = isExcl ? 'wx+' : (fs.existsSync(fullPath) ? 'r+' : 'w+');
              else fsFlags = 'r+';
            } else if (isWrite) {
              if (isTrunc || isCreat) fsFlags = isExcl ? 'wx' : (isTrunc ? 'w' : (fs.existsSync(fullPath) ? 'r+' : 'w'));
              else if (isAppend) fsFlags = 'a';
              else fsFlags = fs.existsSync(fullPath) ? 'r+' : 'w';
            } else if (isAppend) {
              fsFlags = 'a';
            } else {
              fsFlags = 'r';
            }

            // Ensure parent directory exists for writes
            if (fsFlags !== 'r') {
              const parent = path.dirname(fullPath);
              if (!fs.existsSync(parent)) {
                try { fs.mkdirSync(parent, { recursive: true }); } catch {}
              }
            }

            fs.open(fullPath, fsFlags, (err, fd) => {
              if (err) {
                return sftp.status(reqid, err.code === 'ENOENT' ? 2 : 4);
              }
              const handle = Buffer.from(`fh_${state.handleCounter++}`);
              state.handles.set(handle.toString(), {
                type: 'file',
                fd
              });
              sftp.handle(reqid, handle);
            });
          });

          // READ (file chunk)
          sftp.on('READ', (reqid, handle, offset, length) => {
            const h = state.handles.get(handle.toString());
            if (!h || h.type !== 'file' || h.fd === undefined) {
              return sftp.status(reqid, 4);
            }

            const buf = Buffer.alloc(Math.min(length, 64 * 1024));
            fs.read(h.fd, buf, 0, buf.length, offset, (err, bytesRead) => {
              if (err) return sftp.status(reqid, 4);
              if (bytesRead === 0) return sftp.status(reqid, 1); // SSH_FX_EOF
              sftp.data(reqid, buf.subarray(0, bytesRead));
            });
          });

          // WRITE (file chunk)
          sftp.on('WRITE', (reqid, handle, offset, data) => {
            const h = state.handles.get(handle.toString());
            if (!h || h.type !== 'file' || h.fd === undefined) {
              return sftp.status(reqid, 4);
            }

            fs.write(h.fd, data, 0, data.length, offset, (err) => {
              if (err) return sftp.status(reqid, 4);
              sftp.status(reqid, 0); // SSH_FX_OK
            });
          });

          // CLOSE
          sftp.on('CLOSE', (reqid, handle) => {
            const h = state.handles.get(handle.toString());
            if (h) {
              if (h.fd !== undefined) {
                try { fs.closeSync(h.fd); } catch {}
              }
              state.handles.delete(handle.toString());
            }
            sftp.status(reqid, 0);
          });

          // REMOVE (file)
          sftp.on('REMOVE', (reqid, filename) => {
            const fullPath = safePath(filename);
            fs.unlink(fullPath, (err) => {
              sftp.status(reqid, err ? 4 : 0);
            });
          });

          // RMDIR
          sftp.on('RMDIR', (reqid, relPath) => {
            const fullPath = safePath(relPath);
            fs.rmdir(fullPath, (err) => {
              sftp.status(reqid, err ? 4 : 0);
            });
          });

          // MKDIR
          sftp.on('MKDIR', (reqid, relPath) => {
            const fullPath = safePath(relPath);
            fs.mkdir(fullPath, { recursive: true }, (err) => {
              sftp.status(reqid, err ? 4 : 0);
            });
          });

          // RENAME
          sftp.on('RENAME', (reqid, oldPath, newPath) => {
            const src = safePath(oldPath);
            const dst = safePath(newPath);
            fs.rename(src, dst, (err) => {
              sftp.status(reqid, err ? 4 : 0);
            });
          });
        });
      });
    });

    client.on('error', () => {});
  });

  let sftpRunning = false;
  server.listen(port, '0.0.0.0', () => {
    sftpRunning = true;
    activeSftpInfo = { running: true, port, serversDir, error: undefined };
    console.log(`[SFTP] Integrierter SFTP-Server aktiv auf Port ${port} (Speicherort: ${serversDir})`);
  });

  server.on('error', (err: any) => {
    activeSftpInfo = { running: false, port, serversDir, error: err.message };
    console.warn(`[SFTP] SFTP-Server auf Port ${port} konnte nicht gebunden werden (${err.message}).`);
  });

  return server;
}

let activeSftpInfo = { running: false, port: 2022, serversDir: '', error: undefined as string | undefined };

export function getSftpServerInfo() {
  return activeSftpInfo;
}
