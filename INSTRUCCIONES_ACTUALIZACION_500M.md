# MiZona.pe — instalación de cercanía automática a 500 m

Esta actualización se coloca **encima de la Actualización Integral**. Incluye ubicación automática, radio inicial de 500 m, mapa participativo, fotografías moderadas y filtros de cercanía para alertas, servicios, solicitudes, ofertas y empleos.

## 1. Haz una copia de seguridad

Antes de reemplazar archivos, descarga una copia del repositorio actual desde GitHub o duplica la carpeta en tu computadora.

## 2. Sube los archivos

### Opción recomendada: paquete completo

1. Descomprime `MiZona_Actualizada_500m_Completa.zip`.
2. Abre la carpeta interior `MiZona_Actualizada_500m`.
3. Copia **todo su contenido** a la raíz del repositorio.
4. Acepta reemplazar los archivos existentes.
5. En GitHub Desktop: `Commit to main` y luego `Push origin`.

### Opción alternativa: solo cambios

Copia el contenido de `MiZona_Actualizada_500m_Cambios.zip` sobre el repositorio. Esta opción presupone que la Actualización Integral anterior ya está instalada.

## 3. Ejecuta el SQL en Supabase

### Si ya ejecutaste la Actualización Integral anterior

Ejecuta solamente:

`sql/actualizacion_cercania_500m_mapa.sql`

### Si todavía no ejecutaste la Actualización Integral anterior

Ejecuta el archivo combinado:

`MiZona_SQL_Actualizacion_Total_500m.sql`

En Supabase:

1. Abre `SQL Editor`.
2. Pulsa `New query`.
3. Pega el SQL completo.
4. Pulsa `Run` una sola vez.
5. Al final debe aparecer el mensaje de instalación correcta.

## 4. Qué cambia al ingresar

La primera vez MiZona explica por qué necesita la ubicación. Después el navegador o celular muestra su permiso oficial. Al aceptarlo:

- centra el mapa en la posición del usuario;
- muestra primero contenido dentro de 500 m;
- dibuja el radio alrededor del usuario;
- guarda la preferencia del radio;
- permite ampliar a 1 km, 2 km, 5 km o toda la zona;
- reutiliza por unos minutos la ubicación autorizada para evitar preguntas repetidas.

El navegador no permite obtener la ubicación silenciosamente antes de que el usuario acepte el permiso.

## 5. Fotografías en incidentes

1. Abre `Mapa`.
2. Toca un marcador.
3. En la ficha inferior selecciona `Aportar foto`.
4. El usuario debe tener celular verificado.
5. La fotografía queda como `Pendiente`.
6. El administrador abre `admin-alertas.html`.
7. En `Fotografías y aportes de vecinos`, aprueba o rechaza la evidencia.
8. Solo una fotografía aprobada se muestra públicamente.

El bucket `alertas-evidencias` queda privado. La web genera enlaces temporales para el autor, administradores y fotografías aprobadas.

## 6. Prueba obligatoria con dos cuentas

### Cuenta A

- Permite ubicación.
- Verifica que el radio inicial diga `500 m`.
- Crea una alerta desde el botón principal.
- Confirma que aparezca como `Sin verificar`.

### Cuenta B

- Abre el mapa cerca de la alerta.
- Toca el marcador.
- Confirma la alerta o aporta una fotografía.
- Envía un mensaje privado a la cuenta A.

### Administrador

- Revisa la alerta.
- Aprueba la fotografía.
- Comprueba que la foto aparezca en la ficha del mapa.

### Notificaciones

- Verifica el celular.
- Abre `Notificaciones`.
- Activa OneSignal.
- Pulsa `Enviar prueba`.
- Prueba después un mensaje privado y una alerta desde la otra cuenta.

## 7. Si no ves los cambios

1. Espera a que Vercel termine el despliegue.
2. Abre MiZona en una pestaña nueva.
3. Haz una recarga forzada.
4. En la PWA del celular, ciérrala por completo y vuelve a abrirla.
5. Si sigue mostrando la versión anterior, borra los datos del sitio o reinstala la PWA. El service worker nuevo usa la caché `mizona-v8-cercania-500m-mapa-evidencias`.

## 8. Datos antiguos sin coordenadas

Los registros antiguos pueden no tener latitud ni longitud. MiZona intenta mostrarlos por distrito como compatibilidad. Cuando el propietario vuelva a editar o publicar el servicio, solicitud, negocio u oferta, quedará asociado a una ubicación aproximada.

## 9. Privacidad aplicada

- La última ubicación del usuario se guarda como dato privado de su perfil.
- La posición exacta no se publica como parte del perfil.
- Servicios, solicitudes y evidencias guardan coordenadas aproximadas.
- Las alertas conservan la lógica de ubicación exacta o desplazada según su categoría.
- Las fotografías pendientes no se muestran a otros vecinos.
