# MiZona.pe — Fase 5: Alertas inteligentes

## Mejoras incluidas

1. Selección de ubicación mediante clic en computadora o pulsación larga en celular.
2. Marcador arrastrable y geocodificación inversa opcional.
3. Privacidad de ubicación por categoría: exacta, aproximadamente 50 m, aproximadamente 150 m o solo zona.
4. Coordenadas exactas guardadas en una tabla privada; el mapa público utiliza coordenadas protegidas.
5. Detección de alertas similares por categoría, distancia y antigüedad.
6. Posibilidad de confirmar un reporte existente en lugar de duplicarlo.
7. Confirmación final antes de publicar.
8. Estados visibles: reportada, en revisión, verificada, resuelta, descartada y retirada.
9. Motivo de moderación visible para el autor.
10. Corrección y reenvío a revisión.
11. Página individual `alerta.html` con mapa, historial, seguimiento y participación.
12. Botón para seguir o dejar de seguir una alerta.
13. Valoración “¿Esta información te ayudó?”.
14. Actualizaciones del autor o administrador.
15. Resolución con descripción, enlace de evidencia y confirmación comunitaria.
16. Panel administrativo `admin-alertas.html`.
17. Centro de sugerencias `sugerencias.html`.
18. Preferencias nuevas de notificación: solo verificadas, alertas seguidas y cambios de estado.
19. Edge Function actualizada para respetar las nuevas preferencias.
20. Inicio redirige la publicación al formulario completo de Alertas.

## Archivos principales

- `alertas.html`
- `alerta.html`
- `mapa.html`
- `admin-alertas.html`
- `sugerencias.html`
- `notificaciones.html`
- `js/alertas-mizona.js`
- `js/alert-location-picker.js`
- `js/alerta-detalle.js`
- `js/admin-alertas.js`
- `js/sugerencias.js`
- `js/push-notifications.js`
- `css/alertas-inteligentes.css`
- `sql/fase5_alertas_inteligentes.sql`
- `supabase/functions/send-push/index.ts`
