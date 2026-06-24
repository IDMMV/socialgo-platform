import { supabase, getCurrentUser } from './supabase.js';

const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const esc = (v='') => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = v => v==null || v==='' ? '' : new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(v));
const params = new URLSearchParams(location.search);
const identifier = { id: params.get('id'), slug: params.get('slug') };
let business = null;
let user = null;
let offers = [];
let reviews = [];

function placeholderLogo(name='N'){
  return `<div class="bo-business-logo bo-business-logo-placeholder">${esc((name||'N').slice(0,2).toUpperCase())}</div>`;
}
function ratingSummary(items){
  if(!items.length) return {avg:0,count:0,dist:[0,0,0,0,0]};
  const sum=items.reduce((a,r)=>a+Number(r.puntuacion||0),0);
  const dist=[1,2,3,4,5].map(n=>items.filter(r=>Number(r.puntuacion)===n).length);
  return {avg:sum/items.length,count:items.length,dist};
}
function dateText(value){return value?new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)):'Sin fecha límite';}
function offerCard(o){
  const discount = Number(o.porcentaje_descuento || (o.precio_normal&&o.precio_oferta ? (1-Number(o.precio_oferta)/Number(o.precio_normal))*100 : 0));
  return `<article class="bo-offer-card">
    ${discount>0?`<div class="bo-offer-discount">-${Math.round(discount)}%</div>`:''}
    ${o.imagen_url?`<img class="bo-offer-image" src="${esc(o.imagen_url)}" alt="${esc(o.titulo)}">`:`<div class="bo-offer-placeholder"><i class="ti ti-shopping-bag"></i></div>`}
    <div class="bo-offer-body">
      <h3>${esc(o.titulo)}</h3>
      <div class="bo-price-row"><span class="current">${money(o.precio_oferta ?? o.precio_normal)||esc(o.descuento_texto||'Promoción')}</span>${o.precio_normal&&o.precio_oferta?`<span class="old">${money(o.precio_normal)}</span>`:''}</div>
      <div class="bo-offer-meta"><span><i class="ti ti-calendar"></i> ${dateText(o.vence_en)}</span>${o.stock!=null?`<span>Stock: ${Number(o.stock)}</span>`:''}</div>
      <div class="bo-offer-actions"><a href="oferta.html?id=${encodeURIComponent(o.id)}">Ver oferta</a>${o.permite_cupon?`<button class="coupon" type="button" data-coupon="${o.id}"><i class="ti ti-ticket"></i> Cupón</button>`:`<a href="${business.whatsapp?`https://wa.me/${String(business.whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(`Hola, consulto por ${o.titulo} en MiZona`)}`:'#'}" ${business.whatsapp?'target="_blank" rel="noopener"':''}>Contactar</a>`}</div>
    </div>
  </article>`;
}
function renderPage(services,photos){
  const r=ratingSummary(reviews);
  const root=$('#businessPage');
  const cover=business.portada_url?`<img class="bo-business-cover" src="${esc(business.portada_url)}" alt="Portada de ${esc(business.nombre_comercial)}">`:`<div class="bo-business-cover-placeholder"></div>`;
  const logo=business.logo_url?`<img class="bo-business-logo" src="${esc(business.logo_url)}" alt="Logo de ${esc(business.nombre_comercial)}">`:placeholderLogo(business.nombre_comercial);
  const wa=business.whatsapp?`https://wa.me/${String(business.whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(`Hola ${business.nombre_comercial}, los encontré en MiZona.pe`)}`:'';
  const maps=business.latitud&&business.longitud?`https://www.google.com/maps?q=${business.latitud},${business.longitud}`:business.direccion_publica?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(business.direccion_publica)}`:'';
  const joined=business.creado_en?new Intl.DateTimeFormat('es-PE',{month:'long',year:'numeric'}).format(new Date(business.creado_en)):'';
  const ratingBars=[5,4,3,2,1].map(n=>{
    const count=r.dist[n-1]||0; const pct=r.count?Math.round(count/r.count*100):0;
    return `<div class="bo-review-row"><span>${n}</span><div class="bo-review-bar"><span style="width:${pct}%"></span></div><span>${count}</span></div>`;
  }).join('');

  root.innerHTML=`
    <section class="bo-business-hero">
      ${cover}
      <div class="bo-business-hero-content">
        ${logo}
        <div class="bo-business-identity">
          <h1>${esc(business.nombre_comercial)} ${business.verificado?'<span class="bo-badge verified"><i class="ti ti-rosette-discount-check-filled"></i> Verificado</span>':''}</h1>
          <div class="bo-business-subtitle">${esc(business.descripcion || business.categoria || 'Negocio local en MiZona')}</div>
          <div class="bo-business-meta">
            <span><i class="ti ti-map-pin"></i> ${esc([business.distrito,business.zona].filter(Boolean).join(', ') || 'MiZona')}</span>
            <span><i class="ti ti-clock"></i> ${business.horario&&Object.keys(business.horario).length?'Consulta el horario':'Horario por confirmar'}</span>
            ${r.count?`<span><i class="ti ti-star-filled" style="color:#F6B51B"></i> ${r.avg.toFixed(1)} (${r.count})</span>`:''}
          </div>
        </div>
        <div class="bo-business-actions">
          ${wa?`<a class="wa" href="${wa}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i> WhatsApp</a>`:''}
          ${business.telefono?`<a href="tel:${esc(business.telefono)}"><i class="ti ti-phone"></i> Llamar</a>`:''}
          <a href="mensajes.html?contacto=${encodeURIComponent(business.propietario_id)}"><i class="ti ti-message"></i> Mensaje</a>
          ${maps?`<a href="${maps}" target="_blank" rel="noopener"><i class="ti ti-route"></i> Cómo llegar</a>`:''}
        </div>
      </div>
    </section>

    <nav class="bo-business-tabs">
      <button class="active" type="button" data-scroll="aboutSection">Inicio</button>
      <button type="button" data-scroll="servicesSection">Servicios</button>
      <button type="button" data-scroll="offersSection">Ofertas</button>
      <button type="button" data-scroll="photosSection">Fotos</button>
      <button type="button" data-scroll="reviewsSection">Opiniones (${r.count})</button>
      <button type="button" data-scroll="contactSection">Información</button>
    </nav>

    <div class="bo-public-grid">
      <div class="bo-public-main">
        <section class="bo-card bo-section" id="aboutSection">
          <div class="bo-section-head"><h2>Sobre nosotros</h2></div>
          <div class="bo-about">${esc(business.descripcion || 'Este negocio todavía no ha agregado una descripción.')}</div>
          <div class="bo-check-list">
            ${business.verificado?'<span><i class="ti ti-circle-check-filled"></i> Información verificada por MiZona</span>':''}
            ${business.delivery?'<span><i class="ti ti-circle-check-filled"></i> Delivery disponible</span>':''}
            ${business.atiende_domicilio?'<span><i class="ti ti-circle-check-filled"></i> Atención a domicilio</span>':''}
            <span><i class="ti ti-circle-check-filled"></i> Contacto directo con el negocio</span>
          </div>
        </section>

        <section class="bo-card bo-section" id="servicesSection">
          <div class="bo-section-head"><h2>Servicios y productos</h2></div>
          <div class="bo-service-list">${services.length?services.map(s=>`<article class="bo-service-item"><strong>${esc(s.titulo)}</strong><p>${esc(s.descripcion||'')}</p>${s.precio_desde!=null?`<p style="color:#15966A;font-weight:900">Desde ${money(s.precio_desde)}</p>`:''}</article>`).join(''):'<div class="bo-empty" style="grid-column:1/-1;padding:18px">Este negocio aún no ha publicado servicios.</div>'}</div>
        </section>

        <section class="bo-card bo-section" id="offersSection">
          <div class="bo-section-head"><h2>Ofertas vigentes</h2><a href="ofertas.html">Ver Zona Ofertas</a></div>
          <div class="bo-offer-grid">${offers.length?offers.map(offerCard).join(''):'<div class="bo-empty" style="grid-column:1/-1;padding:18px">No hay ofertas vigentes en este momento.</div>'}</div>
        </section>

        <section class="bo-card bo-section" id="photosSection">
          <div class="bo-section-head"><h2>Galería de fotos</h2></div>
          <div class="bo-photo-grid">${photos.length?photos.map(p=>`<img src="${esc(p.url)}" alt="${esc(p.descripcion||business.nombre_comercial)}" loading="lazy">`).join(''):'<div class="bo-empty" style="grid-column:1/-1;padding:18px">Este negocio todavía no agregó fotografías.</div>'}</div>
        </section>

        <section class="bo-card bo-section" id="reviewsSection">
          <div class="bo-section-head"><h2>Opiniones de vecinos</h2><button type="button" id="openReview"><i class="ti ti-star"></i> Escribir opinión</button></div>
          <div class="bo-review-summary">
            <div class="bo-review-score"><strong>${r.count?r.avg.toFixed(1):'—'}</strong><div class="bo-stars">★★★★★</div><small>${r.count} opiniones</small></div>
            <div class="bo-review-bars">${ratingBars}</div>
          </div>
          <div style="display:grid;gap:9px;margin-top:17px">${reviews.slice(0,5).map(rv=>`<article style="padding:12px;border:1px solid #E5EBF2;border-radius:12px"><div style="display:flex;justify-content:space-between;gap:10px"><strong style="font-size:11px">Vecino MiZona</strong><span class="bo-stars" style="font-size:10px">${'★'.repeat(rv.puntuacion)}${'☆'.repeat(5-rv.puntuacion)}</span></div><p style="margin:7px 0 0;color:#5F7084;font-size:10px;line-height:1.5">${esc(rv.comentario||'Sin comentario')}</p></article>`).join('')}</div>
        </section>
      </div>

      <aside class="bo-side-stack">
        <section class="bo-card bo-side-card">
          <h3>Confianza MiZona</h3>
          <div class="bo-trust-list">
            ${business.verificado?'<div class="bo-trust-item"><i class="ti ti-shield-check"></i><div><strong>Negocio verificado</strong><span>Información revisada por MiZona.</span></div></div>':''}
            <div class="bo-trust-item"><i class="ti ti-thumb-up"></i><div><strong>${r.count} opiniones</strong><span>${r.count?`${r.avg.toFixed(1)} de calificación promedio`:'Sé el primero en opinar'}</span></div></div>
            <div class="bo-trust-item"><i class="ti ti-calendar"></i><div><strong>En MiZona desde ${esc(joined||'hoy')}</strong><span>Página comercial activa.</span></div></div>
          </div>
        </section>

        <section class="bo-card bo-side-card bo-contact-card" id="contactSection">
          <h3>Información y contacto</h3>
          <div class="bo-contact-list">
            ${business.direccion_publica?`<div><i class="ti ti-map-pin"></i><span>${esc(business.direccion_publica)}</span></div>`:''}
            ${business.telefono?`<a href="tel:${esc(business.telefono)}"><i class="ti ti-phone"></i><span>${esc(business.telefono)}</span></a>`:''}
            ${business.whatsapp?`<a href="${wa}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i><span>Escribir por WhatsApp</span></a>`:''}
            ${business.correo_publico?`<a href="mailto:${esc(business.correo_publico)}"><i class="ti ti-mail"></i><span>${esc(business.correo_publico)}</span></a>`:''}
            ${business.sitio_web?`<a href="${esc(business.sitio_web)}" target="_blank" rel="noopener"><i class="ti ti-world"></i><span>Visitar sitio web</span></a>`:''}
          </div>
          <div class="bo-form-actions">${wa?`<a class="bo-primary-btn" href="${wa}" target="_blank" rel="noopener"><i class="ti ti-brand-whatsapp"></i> Contactar</a>`:''}<button class="bo-secondary-btn" id="shareBusiness" type="button"><i class="ti ti-share"></i> Compartir</button></div>
        </section>
      </aside>
    </div>`;

  document.title=`${business.nombre_comercial} — MiZona.pe`;
  bindPageActions();
}

function bindPageActions(){
  $$('[data-scroll]').forEach(btn=>btn.addEventListener('click',()=>{
    $$('[data-scroll]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
    document.getElementById(btn.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
  $('#openReview')?.addEventListener('click',async()=>{
    if(!user){location.href=`login.html?next=${encodeURIComponent(location.pathname+location.search)}`;return;}
    $('#reviewModal').classList.add('open');
  });
  $('#shareBusiness')?.addEventListener('click',async()=>{
    const payload={title:business.nombre_comercial,text:`Conoce ${business.nombre_comercial} en MiZona.pe`,url:location.href};
    if(navigator.share) await navigator.share(payload).catch(()=>{}); else {await navigator.clipboard?.writeText(location.href);alert('Enlace copiado');}
  });
  $$('[data-coupon]').forEach(btn=>btn.addEventListener('click',()=>claimCoupon(btn.dataset.coupon,btn)));
}

async function claimCoupon(id,button){
  if(!user){location.href=`login.html?next=${encodeURIComponent(location.pathname+location.search)}`;return;}
  button.disabled=true;
  try{
    const {data,error}=await supabase.rpc('reclamar_cupon',{p_oferta_id:id});if(error)throw error;
    $('#couponPublicContent').innerHTML=`<div style="text-align:center;padding:10px"><div style="font-size:42px;color:#6D35E8"><i class="ti ti-ticket"></i></div><h3>Tu código</h3><div style="padding:16px;border:2px dashed #C8B6F6;border-radius:12px;font-size:24px;font-weight:900;color:#5D2AD4;letter-spacing:2px">${esc(data.codigo)}</div><p style="color:#65758B;font-size:11px">Preséntalo en ${esc(business.nombre_comercial)}.</p></div>`;
    $('#couponModal').classList.add('open');
  }catch(e){alert(e.message||'No se pudo obtener el cupón');}
  finally{button.disabled=false;}
}

async function load(){
  const root=$('#businessPage');
  try{
    user=await getCurrentUser();
    let query=supabase.from('negocios').select('*');
    if(identifier.slug) query=query.eq('slug',identifier.slug); else if(identifier.id) query=query.eq('id',identifier.id); else throw new Error('Falta identificar el negocio');
    const {data,error}=await query.maybeSingle();if(error)throw error;if(!data)throw new Error('Negocio no encontrado o no disponible');
    business=data;
    const [{data:serviceData,error:serviceError},{data:photoData,error:photoError},{data:offerData,error:offerError},{data:reviewData,error:reviewError}]=await Promise.all([
      supabase.from('negocio_servicios').select('*').eq('negocio_id',business.id).eq('activo',true).order('orden'),
      supabase.from('negocio_fotos').select('*').eq('negocio_id',business.id).eq('visible',true).order('orden'),
      supabase.from('ofertas_negocios').select('*').eq('comercio_id',business.id).eq('estado','publicada').eq('activa',true).order('aprobado_en',{ascending:false}),
      supabase.from('negocio_resenas').select('id,puntuacion,comentario,creado_en').eq('negocio_id',business.id).eq('visible',true).order('creado_en',{ascending:false})
    ]);
    if(serviceError)throw serviceError;if(photoError)throw photoError;if(offerError)throw offerError;if(reviewError)throw reviewError;
    offers=offerData||[];reviews=reviewData||[];
    renderPage(serviceData||[],photoData||[]);
  }catch(e){
    root.innerHTML=`<div class="bo-card bo-empty"><i class="ti ti-building-store-off"></i><strong>No pudimos abrir esta página</strong><span>${esc(e.message)}</span><div class="bo-form-actions" style="justify-content:center"><a class="bo-primary-btn" href="ofertas.html">Volver a Zona Ofertas</a></div></div>`;
  }
}

$('#reviewForm')?.addEventListener('submit',async e=>{
  e.preventDefault();if(!user||!business)return;
  const button=e.submitter;button.disabled=true;
  try{
    const payload={negocio_id:business.id,usuario_id:user.id,puntuacion:Number($('#reviewScore').value),comentario:$('#reviewComment').value.trim()||null,visible:true};
    const {error}=await supabase.from('negocio_resenas').upsert(payload,{onConflict:'negocio_id,usuario_id'});if(error)throw error;
    $('#reviewModal').classList.remove('open');location.reload();
  }catch(err){alert(err.message||'No se pudo guardar la opinión');}
  finally{button.disabled=false;}
});
$$('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('.bo-modal-backdrop').classList.remove('open')));
$$('.bo-modal-backdrop').forEach(modal=>modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')}));

load();
