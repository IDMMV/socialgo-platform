# MiZona.pe — Proyecto Completo

**"Tu zona, tu gente, tus oportunidades."**

Dominio: mizona.pe | Stack: Vercel + GitHub + Supabase

---

## Configuración inicial

### 1. Configurar Supabase
Edita `js/env.public.js` y reemplaza:
```js
SUPABASE_URL: "TU_SUPABASE_URL",
SUPABASE_PUBLISHABLE_KEY: "TU_SUPABASE_ANON_KEY",
```

Ejecuta los SQL en orden en Supabase SQL Editor:
1. `sql/schema_mizona_fase1b.sql` — tablas principales
2. `sql/schema_cupones_qr.sql` — sistema de cupones

### 2. Subir a GitHub
- Reemplaza todos los archivos en tu repo `socialgo-platform`
- Vercel desplegará automáticamente

### 3. Configurar dominio en Vercel
- Vercel → tu proyecto → Settings → Domains
- Agrega `mizona.pe`
- En NIC Perú → tu dominio → Gestionar DNS:
  - Registro A: `@` → `76.76.21.21`
  - CNAME: `www` → `cname.vercel-dns.com`

---

## Estructura del proyecto

```
mizona/
├── index.html          ← Página principal con mapa
├── alertas.html        ← Feed de alertas
├── mapa.html           ← Mapa completo de alertas
├── servicios.html      ← Directorio de técnicos
├── solicitudes.html    ← Solicitudes de cotización
├── ofertas.html        ← Zona Ofertas
├── negocio.html        ← Panel del negocio (con QR)
├── ride.html           ← MiZonaRide taxi comunitario
├── empleos.html        ← Bolsa de trabajo
├── perfil.html         ← Perfil del usuario
├── mensajes.html       ← Mensajes
├── admin.html          ← Panel administrador
├── login.html          ← Inicio de sesión
├── registro.html       ← Crear cuenta
├── css/
│   ├── mizona.css      ← CSS principal MiZona
│   └── mizona-dark.css ← CSS tema oscuro
├── js/
│   ├── env.public.js   ← ⚠️ CONFIGURA AQUÍ tu Supabase
│   ├── supabase.js     ← Cliente Supabase
│   ├── auth.js         ← Autenticación
│   ├── alertas-mizona.js
│   ├── mapa-mizona.js
│   └── dashboard-mizona.js
└── sql/
    ├── schema_mizona_fase1b.sql  ← Ejecutar primero
    └── schema_cupones_qr.sql     ← Ejecutar segundo
```

---

## Módulos implementados

- ✅ Alertas vecinales (ciudadanas y oficiales)
- ✅ Mapa Leaflet en tiempo real (OpenStreetMap - gratis)
- ✅ Sistema anti-fraude (puntos por reputación)
- ✅ Botón de pánico con GPS
- ✅ Directorio de servicios locales
- ✅ Solicitudes de cotización privada
- ✅ Panel de negocio completo
- ✅ Sistema de cupones QR verificados
- ✅ Zona Ofertas
- ✅ MiZonaRide (taxi comunitario)
- ✅ PWA instalable (Android)
- ✅ Login/Registro con Supabase Auth

## Por implementar (próximas fases)

- [ ] Notificaciones push (Web Push API + VAPID)
- [ ] Panel de municipalidad
- [ ] Comunidades y grupos
- [ ] Páginas de negocios completas
- [ ] Integración Bomberos Perú automática
- [ ] App Android nativa (React Native)
