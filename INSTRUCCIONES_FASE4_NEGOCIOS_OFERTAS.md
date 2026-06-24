# Instalación de la Fase 4

## 1. Copiar archivos a GitHub

1. Guarda una copia de seguridad de tu repositorio actual.
2. Descomprime `MiZona_Fase4_Negocios_Ofertas.zip`.
3. Copia **todo el contenido interior** de la carpeta sobre tu repositorio.
4. Acepta reemplazar archivos.
5. En GitHub Desktop escribe:

   `Fase 4: páginas de negocios y catálogo de ofertas`

6. Presiona **Commit to main** y luego **Push origin**.

## 2. Ejecutar SQL obligatorio

En Supabase abre:

`SQL Editor → New query`

Copia y ejecuta todo el archivo:

`sql/fase4_negocios_ofertas.sql`

Debe terminar mostrando tres cantidades: negocios, solicitudes y ofertas.

## 3. Flujo de prueba

### Usuario propietario

1. Inicia sesión.
2. Abre `https://mizona.pe/negocio.html`.
3. Completa la solicitud del negocio.

### Administrador

1. Abre `https://mizona.pe/admin-negocios.html`.
2. Aprueba la solicitud.

### Propietario

1. Regresa a `negocio.html`.
2. Edita la información, sube portada y logotipo.
3. Crea una oferta y pulsa **Enviar a revisión**.

### Administrador

1. Regresa a `admin-negocios.html`.
2. Publica la oferta.

### Cliente

1. Abre `https://mizona.pe/ofertas.html`.
2. La oferta debe aparecer en el catálogo.
3. Pulsa el nombre del negocio para abrir su página pública.

## 4. Páginas nuevas

- `negocio-publico.html`
- `oferta.html`
- `admin-negocios.html`

## 5. Nota sobre cuentas antiguas

La fase no convierte automáticamente una cuenta personal en negocio. La misma cuenta personal puede administrar uno o varios negocios mediante `negocio_miembros`.
