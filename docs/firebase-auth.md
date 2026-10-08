# Firebase Authentication — Fase 2

## 1. Crear el proyecto

En Firebase Console crea o selecciona el proyecto de EBSA. En **Authentication → Sign-in method**, activa **Email/Password**.

Crea una aplicación web y copia su configuración en `frontend/.env.local` para desarrollo. Los valores `VITE_FIREBASE_*` son configuración pública del navegador; no reemplazan la protección del backend.

## 2. Configurar FastAPI

En **Project settings → Service accounts**, genera una clave privada para Firebase Admin SDK. No la subas a Git. En desarrollo configura:

```env
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

En Vercel configura las mismas variables en Project Settings → Environment Variables.

## 3. Crear usuarios

Los usuarios se crean desde Firebase Console en la Fase 2. La aplicación solo permitirá acceso cuando el backend pueda verificar el ID Token y exista un rol en Custom Claims.

Roles válidos:

```text
COMERCIAL
SOPORTE
ADMIN_MODELO
```

## 4. Asignar rol

La asignación inicial se hará mediante un script administrativo seguro usando Firebase Admin SDK. No se expondrá una clave privada en el frontend. En la Fase 2 avanzada se añadirá una pantalla de administración respaldada por un endpoint protegido exclusivamente para `ADMIN_MODELO`.

## 5. Probar

Con Firebase configurado y un usuario con claim `role`, inicia sesión en `/login`. El frontend obtiene el ID Token, lo envía como `Authorization: Bearer ...` a `/api/me`, y FastAPI verifica firma, expiración, revocación y rol.

Si Firebase no está configurado, la aplicación muestra la configuración pendiente y no inventa una sesión.
