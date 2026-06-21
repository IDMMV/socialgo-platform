-- SOCIALGO ACTUALIZACIÓN 4.1

drop policy if exists "Administradores ven bloqueos" on public.usuarios_bloqueados;
create policy "Administradores ven bloqueos"
on public.usuarios_bloqueados for select
to authenticated
using (bloqueador_id = auth.uid() or public.is_admin());

create or replace view public.reportes_admin_detalle
with (security_invoker = true)
as
select
  r.id, r.creado_en, r.motivo, r.estado, r.reportante_id,
  reportante.username as reportante_username,
  p.autor_id, autor.username as autor_username,
  p.id as publicacion_id, p.contenido, p.archivo_url
from public.reportes_contenido r
join public.publicaciones p on p.id = r.publicacion_id
join public.perfiles reportante on reportante.id = r.reportante_id
join public.perfiles autor on autor.id = p.autor_id
where public.is_admin();

grant select on public.reportes_admin_detalle to authenticated;

create or replace view public.bloqueos_admin_detalle
with (security_invoker = true)
as
select
  ub.creado_en, ub.bloqueador_id,
  bloqueador.username as bloqueador_username,
  ub.bloqueado_id,
  bloqueado.username as bloqueado_username
from public.usuarios_bloqueados ub
join public.perfiles bloqueador on bloqueador.id = ub.bloqueador_id
join public.perfiles bloqueado on bloqueado.id = ub.bloqueado_id
where public.is_admin();

grant select on public.bloqueos_admin_detalle to authenticated;
