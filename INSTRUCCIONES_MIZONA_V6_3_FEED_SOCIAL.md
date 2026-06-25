# INSTALACIÓN — MiZona V6.3 Feed Social

## Requisito

Debes tener instalada la V6.2. En tu captura ya aparecen “Edición cerrada” y “Borrar”, por lo tanto puedes continuar directamente.

## 1. No ejecutes SQL

Esta actualización es de interfaz y comportamiento del perfil. Conserva las políticas de la V6.2:

- modificar una publicación solo durante 5 minutos;
- borrar una publicación en cualquier momento por su autor.

## 2. Sube los archivos

Descomprime `MiZona_WEB_FINAL_V6_3_FEED_SOCIAL_Cambios.zip` y reemplaza en GitHub:

```text
usuario.html
service-worker.js
css/perfiles-mizona.css
js/perfil-publico.js
```

Conserva exactamente las carpetas `css` y `js`.

## 3. Espera el despliegue

Espera a que Vercel termine el nuevo despliegue.

## 4. Actualiza la web

En computadora:

```text
Ctrl + F5
```

En celular o PWA:

1. Cierra MiZona completamente.
2. Vuelve a abrirla.
3. Si todavía aparece la versión anterior, borra la caché o los datos del sitio `mizona.pe` y entra nuevamente.

## 5. Prueba

1. Entra en tu perfil.
2. Baja a Publicaciones.
3. Abre el menú de tres puntos.
4. Comprueba Editar o Edición cerrada, Guardar y Eliminar.
5. Presiona Me interesa.
6. Abre Comentarios y publica uno.
7. Prueba Compartir.
8. Revisa la vista desde celular.

## Resultado esperado

- El perfil personal ya no muestra una portada gigante.
- Las publicaciones ocupan una columna central amplia.
- La imagen se muestra completa.
- Los comentarios aparecen debajo de la publicación.
- Los controles se ven y funcionan como un feed social moderno.
