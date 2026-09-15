# Copia de seguridad del servidor (backup)

Sistema de copia diaria **incremental** de los datos del VPS: solo lo que cambia
cada día ocupa espacio o viaja por la red. Dos capas independientes:

1. **Snapshots en el VPS** (`/home/deploy/backups/snapshots/YYYY-MM-DD/`): cada día a las
   03:30 se construye un snapshot con `rsync --link-dest`; los ficheros que no han
   cambiado son *hardlinks* al snapshot anterior. Retención: **180 días**.
2. **Copia externa cifrada en el equipo local** (`~/Lur/backups/cifra-repo`): repositorio
   [`restic`](https://restic.net) con cifrado y deduplicación. El script descarga solo
   los snapshots nuevos y, dentro de cada uno, solo los ficheros que cambiaron. La
   retención local es **independiente** de la del VPS: 30 diarios + 12 semanales +
   12 mensuales (≈ 1 año de cobertura). En el equipo local **no queda ninguna copia
   en claro**: el área de trabajo temporal se borra al terminar cada ejecución.

## ¿Qué pasa si no enciendo el ordenador?

Nada se pierde mientras el VPS conserve el snapshot: el VPS sigue haciendo su
snapshot diario esté el PC encendido o no. Al encender, el timer (con
`Persistent=true`) recupera los días perdidos y descarga uno a uno los snapshots
que siga teniendo el VPS. Mientras la ausencia sea **menor de 180 días**, no se
pierde ni un día. Si el PC está más de 180 días apagado, esos días ya no estarán
en el VPS.

## ¿Cuánto ocupa?

| Dónde | Cálculo | Estimación |
|---|---|---|
| VPS | 54 MB base + ~1-2 MB/día × 180 días | **~0,3 GB** |
| Equipo local (restic) | 34 MB el primer snapshot (comprimido/deduplicado) + 1-2 MB/día; con la política de retención | **~0,1-0,3 GB por año** |
| Red por ejecución diaria | solo el delta | **~1-2 MB** |

El crecimiento depende de los datos reales que cambien (subidas de PDFs, análisis
nuevos, dumps). Con el uso actual, el backup completo cabe de sobra en menos de
1 GB al año por ambas partes.

## Contenido de cada snapshot

| Ruta | Qué incluye |
|---|---|
| `var-www/cifra-prod/` y `var-www/cifra-dev/` | Código, `.env`, `uploads/` (PDFs y análisis generados), `src/`, `public/`, `documentacion/`… |
| `db-dumps/` | Dumps `pg_dump` del día (`cifra_prod` y `cifra_dev`), verificados con `gzip -t` |
| `etc/nginx/` | Configuración de Nginx y cabeceras de seguridad |
| `etc/systemd/` | Unidades `cifra-*.service` |
| `home-deploy/` | Scripts de backup y `crontab` del usuario `deploy` |
| `.completed` | Marca con fecha, host y dumps incluidos (indica que el snapshot terminó bien) |

Se excluyen `node_modules/` y `.git/` (regenerables: `npm ci` y GitHub) y `logs/`
(operativos). Sin exclusiones, cada snapshot supera los 200 MB por entorno; con
ellas, el snapshot completo ronda los 54 MB y los deltas diarios, ~1-2 MB.

## Programación

| Dónde | Cuándo | Qué ejecuta |
|---|---|---|
| VPS (`crontab -l` de `deploy`) | 03:00 | `/home/deploy/backup-db.sh` → dumps de las dos BD a `/home/deploy/backups/` |
| VPS | 03:30 | `/home/deploy/backup-server.sh` → snapshot diario + retención (180 días) |
| Equipo local (systemd usuario) | 09:30 | `scripts/backup/pull-server-backup.sh` → pull incremental, cifrado y verificación |

- El timer local es **persistente** (`Persistent=true`): si el equipo estaba apagado
  a las 09:30, la copia se lanza al encender/iniciar sesión. Para que se ejecute
  sin sesión iniciada: `sudo loginctl enable-linger lur`.
- Los dumps sueltos del VPS se podan a los 14 días, pero cada snapshot conserva una
  hardlink al fichero, así que sobreviven mientras viva el snapshot (180 días).
- Ambos scripts usan bloqueo (`flock`): nunca se solapan dos ejecuciones.

## Cifrado y contraseña (importante)

- El repositorio restic está cifrado (AES-256) y su contraseña vive en
  `~/.config/cifra-backup/restic-password` (permisos `600`).
- **Guarda una copia de esa contraseña en tu gestor de contraseñas.** Sin ella, el
  repositorio no se puede abrir y las copias son irrecuperables.
- La contraseña está en el mismo equipo que la copia: protege frente a copias del
  backup sacadas del portátil (USB, nube, otro equipo) y frente a otros usuarios,
  pero no frente a quien tenga acceso completo a tu carpeta personal.

## Ficheros del sistema

| Fichero | Dónde vive |
|---|---|
| `scripts/backup/backup-server.sh` | Repositorio e instalado en `/home/deploy/backup-server.sh` |
| `scripts/backup/pull-server-backup.sh` | Repositorio (se ejecuta desde el equipo local) |
| `~/.local/bin/restic` | Equipo local (binario estático v0.19.1; actualizar descargando de GitHub) |
| `~/.config/cifra-backup/restic-password` | Equipo local (contraseña del repositorio, `600`) |
| `~/.config/systemd/user/cifra-backup-pull.{service,timer}` | Equipo local |
| `~/.ssh/config` → `Host cifra-vps` | Equipo local (alias SSH; evita escribir la IP en el repo) |
| `~/Lur/backups/cifra/state/backed-up.txt` | Fechas ya guardadas en el repositorio (control interno) |

Variables de entorno para rutas alternativas: `CIFRA_VPS_SSH`, `CIFRA_VPS_BACKUP_DIR`,
`CIFRA_LOCAL_BACKUP_DIR`, `CIFRA_RESTIC_REPO`, `CIFRA_RESTIC_PASSWORD_FILE`,
`CIFRA_RESTIC_BIN`, `CIFRA_KEEP_DAILY`, `CIFRA_KEEP_WEEKLY`, `CIFRA_KEEP_MONTHLY`.

## Cómo restaurar

```bash
export RESTIC_REPOSITORY=~/Lur/backups/cifra-repo
export RESTIC_PASSWORD_FILE=~/.config/cifra-backup/restic-password
R=~/.local/bin/restic

# Ver qué fechas hay disponibles
$R snapshots

# Restaurar un snapshot completo a una carpeta
$R restore latest --target ~/restaurar            # el más reciente
$R restore <id> --target ~/restaurar              # uno concreto

# Restaurar solo un fichero (p. ej. el .env de producción de un día)
$R restore latest --target /tmp/restaurar --include "/2026-09-15/var-www/cifra-prod/.env"

# Subir un fichero o carpeta restaurada al VPS
scp -r /tmp/restaurar/2026-09-15/var-www/cifra-prod/uploads/ cifra-vps:/var/www/cifra-prod/

# Restaurar la base de datos en el VPS
gunzip -c /tmp/restaurar/2026-09-15/db-dumps/cifra_prod_*.sql.gz | ssh cifra-vps 'psql "$DATABASE_URL"'
```

## Comprobar el estado

```bash
# Última ejecución local
tail -n 40 ~/Lur/backups/cifra/pull.log

# Prueba de integridad manual (el script hace una parcial cada día)
RESTIC_REPOSITORY=~/Lur/backups/cifra-repo RESTIC_PASSWORD_FILE=~/.config/cifra-backup/restic-password ~/.local/bin/restic check --read-data

# Estado del VPS
ssh cifra-vps 'du -sh /home/deploy/backups/snapshots; ls /home/deploy/backups/snapshots | tail; tail -5 /home/deploy/backups/backup.log'

# Timer local
systemctl --user list-timers cifra-backup-pull.timer
du -sh ~/Lur/backups/cifra-repo
```

## Limitaciones y mejoras futuras

- Si el PC está apagado más de 180 días, los snapshots más antiguos se pierden
  (se puede subir la retención del VPS: `CIFRA_BACKUP_RETENTION_DAYS`).
- Hay una única copia externa (el portátil). Alternativa 24/7 sin depender del PC:
  copiar el repositorio restic (ya cifrado) a un almacenamiento de objetos S3
  compatible (p. ej. Contabo Object Storage) y añadir bloqueo de objetos para
  hacerlo inmutable.
- El phishing/ransomware en el PC puede borrar el repositorio local; el VPS
  conserva la copia de 180 días como red de seguridad.
