import { supabase, getCurrentUser } from './supabase.js';

const state = {
  offers: [],
  businesses: new Map(),
  saved: new Set(),
  user: null,
  category: '',
  query: '',
  district: '',
  sort: 'recent',
  shown: 12
};

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (v='') => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => value == null || value === '' ? '' : new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(value));
const dateText = value => value ? new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value)) : 'Sin fecha límite';
const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function status(message, type='info') {
  const box = $('#catalogStatus');
  if (!box) return;
  box.textContent = message;
  box.className = `bo-status show ${type}`;
  setTimeout(() => box.classList.remove('show'), 4200);
}

function businessFor(offer) {
  return state.businesses.get(offer.comercio_id) || {
    id: offer.comercio_id,
    nombre_comercial: 'Negocio MiZona',
    categoria: offer.categoria || 'otros',
    distrito: offer.distrito || '',
    logo_url: '',
    slug: ''
  };
}

function discountFor(offer) {
  if (Number(offer.porcentaje_descuento) > 0) return Math.round(Number(offer.porcentaje_descuento));
  const normal = Number(offer.precio_normal);
  const promo = Number(offer.precio_oferta);
  return normal > 0 && promo >= 0 && promo < normal ? Math.round((1 - promo/normal) * 100) : 0;
}

function imageMarkup(offer, cls='bo-offer-image') {
  return offer.imagen_url
    ? `<img class="${cls}" src="${esc(offer.imagen_url)}" alt="${esc(offer.titulo)}" loading="lazy">`
    : `<div class="bo-offer-placeholder"><i class="ti ti-shopping-bag"></i></div>`;
}

function offerCard(offer) {
  const business = businessFor(offer);
  const discount = discountFor(offer);
  const isSaved = state.saved.has(offer.id);
  const couponButton = offer.permite_cupon
    ? `<button class="coupon" type="button" data-coupon="${offer.id}"><i class="ti ti-ticket"></i> Obtener cupón</button>`
    : `<a href="oferta.html?id=${encodeURIComponent(offer.id)}">Ver oferta</a>`;
  const distance = business.distrito || offer.distrito || 'Tu zona';
  const stock = Number.isFinite(Number(offer.stock)) && offer.stock !== null
    ? `<span class="bo-offer-tag">Stock: ${Math.max(0,Number(offer.stock))}</span>` : '';

  return `<article class="bo-offer-card">
    ${discount ? `<div class="bo-offer-discount">-${discount}%</div>` : ''}
    <button class="bo-heart ${isSaved?'saved':''}" type="button" data-save="${offer.id}" aria-label="${isSaved?'Quitar de guardados':'Guardar oferta'}"><i class="ti ti-heart${isSaved?'-filled':''}"></i></button>
    ${imageMarkup(offer)}
    <div class="bo-offer-body">
      <a class="bo-business-line" href="negocio-publico.html?${business.slug ? `slug=${encodeURIComponent(business.slug)}` : `id=${encodeURIComponent(business.id || '')}`}">
        ${business.logo_url ? `<img src="${esc(business.logo_url)}" alt="">` : `<span class="bo-side-logo" style="width:22px;height:22px;display:grid;place-items:center;font-size:9px">${esc((business.nombre_comercial||'N')[0])}</span>`}
        <span>${esc(business.nombre_comercial)}</span>${business.verificado ? '<i class="ti ti-rosette-discount-check-filled"></i>' : ''}
      </a>
      <h3>${esc(offer.titulo)}</h3>
      <div class="bo-price-row">
        <span class="current">${money(offer.precio_oferta ?? offer.precio_normal) || esc(offer.descuento_texto || 'Promoción')}</span>
        ${offer.precio_normal && offer.precio_oferta ? `<span class="old">${money(offer.precio_normal)}</span>` : ''}
      </div>
      ${stock}
      <div class="bo-offer-meta"><span><i class="ti ti-calendar"></i> ${dateText(offer.vence_en)}</span><span><i class="ti ti-map-pin"></i> ${esc(distance)}</span></div>
      <div class="bo-offer-actions"><a href="oferta.html?id=${encodeURIComponent(offer.id)}">Ver oferta</a>${couponButton}</div>
    </div>
  </article>`;
}

function featuredMarkup(offer) {
  const business = businessFor(offer);
  const discount = discountFor(offer);
  return `${offer.imagen_url ? `<img class="bo-featured-media" src="${esc(offer.imagen_url)}" alt="">` : ''}
    <div class="bo-featured-copy">
      <span class="bo-featured-kicker">OFERTA DESTACADA</span>
      <a class="bo-featured-business" href="negocio-publico.html?${business.slug?`slug=${encodeURIComponent(business.slug)}`:`id=${encodeURIComponent(business.id||'')}`}">
        ${business.logo_url ? `<img src="${esc(business.logo_url)}" alt="">` : ''}
        ${esc(business.nombre_comercial)} ${business.verificado ? '✓' : ''}
      </a>
      <h2>${esc(offer.titulo)}</h2>
      <p>${esc(offer.descripcion || offer.condiciones || 'Promoción disponible por tiempo limitado.')}</p>
      <div class="bo-featured-price">
        ${offer.precio_normal && offer.precio_oferta ? `<span class="bo-old-price">${money(offer.precio_normal)}</span>` : ''}
        <span class="bo-new-price">${money(offer.precio_oferta ?? offer.precio_normal) || esc(offer.descuento_texto || 'Oferta')}</span>
        ${discount ? `<span class="bo-discount">-${discount}%</span>` : ''}
      </div>
      <div class="bo-form-actions"><a class="bo-primary-btn" href="oferta.html?id=${encodeURIComponent(offer.id)}">Ver oferta <i class="ti ti-arrow-right"></i></a></div>
    </div>`;
}

function filteredOffers() {
  let list = [...state.offers];
  if (state.category) list = list.filter(o => normalize(o.categoria || businessFor(o).categoria) === normalize(state.category));
  if (state.district) list = list.filter(o => normalize(o.distrito || businessFor(o).distrito) === normalize(state.district));
  if (state.query) {
    const q = normalize(state.query);
    list = list.filter(o => {
      const b = businessFor(o);
      return normalize([o.titulo,o.descripcion,o.condiciones,o.categoria,b.nombre_comercial,b.categoria,b.distrito].join(' ')).includes(q);
    });
  }
  if (state.sort === 'discount') list.sort((a,b)=>discountFor(b)-discountFor(a));
  else if (state.sort === 'price') list.sort((a,b)=>Number(a.precio_oferta ?? a.precio_normal ?? Infinity)-Number(b.precio_oferta ?? b.precio_normal ?? Infinity));
  else if (state.sort === 'ending') list.sort((a,b)=>new Date(a.vence_en || '2999-01-01')-new Date(b.vence_en || '2999-01-01'));
  else list.sort((a,b)=>new Date(b.aprobado_en || b.created_at)-new Date(a.aprobado_en || a.created_at));
  return list;
}

function render() {
  const list = filteredOffers();
  const visible = list.slice(0,state.shown);
  const grid = $('#offerGrid');
  const featured = $('#featuredOffer');
  const loadMore = $('#loadMoreOffers');

  if (!list.length) {
    featured.classList.add('bo-hidden');
    grid.innerHTML = `<div class="bo-card bo-empty" style="grid-column:1/-1"><i class="ti ti-tag-off"></i><strong>No encontramos ofertas con esos filtros</strong><span>Prueba otra categoría o revisa nuevamente más tarde.</span></div>`;
  } else {
    const top = list.find(o=>o.es_boost) || list[0];
    featured.innerHTML = featuredMarkup(top);
    featured.classList.remove('bo-hidden');
    grid.innerHTML = visible.map(offerCard).join('');
  }
  loadMore.classList.toggle('bo-hidden', visible.length >= list.length);
  bindDynamicActions();
}

function renderBusinesses() {
  const container = $('#featuredBusinesses');
  const businesses = [...state.businesses.values()]
    .sort((a,b)=>Number(b.destacado)-Number(a.destacado) || String(a.nombre_comercial).localeCompare(String(b.nombre_comercial)))
    .slice(0,5);
  container.innerHTML = businesses.length ? businesses.map(b=>`<a class="bo-side-business" href="negocio-publico.html?${b.slug?`slug=${encodeURIComponent(b.slug)}`:`id=${encodeURIComponent(b.id)}`}">
    ${b.logo_url ? `<img src="${esc(b.logo_url)}" alt="">` : `<span class="bo-side-logo" style="display:grid;place-items:center;font-weight:900">${esc((b.nombre_comercial||'N')[0])}</span>`}
    <div><strong>${esc(b.nombre_comercial)} ${b.verificado?'✓':''}</strong><small>${esc(b.categoria || 'Negocio')} · ${esc(b.distrito || 'MiZona')}</small></div>
  </a>`).join('') : '<div class="bo-empty" style="padding:12px">Aún no hay negocios destacados.</div>';
}

async function loadSaved() {
  if (!state.user) return;
  const [{data:saved},{count:coupons}] = await Promise.all([
    supabase.from('ofertas_guardadas').select('oferta_id').eq('usuario_id',state.user.id),
    supabase.from('cupones_clientes').select('id',{count:'exact',head:true}).eq('usuario_id',state.user.id)
  ]);
  state.saved = new Set((saved || []).map(x=>x.oferta_id));
  $('#savedCouponCount').textContent = coupons ?? 0;
}

async function loadCatalog() {
  try {
    state.user = await getCurrentUser();
    const {data:offers,error} = await supabase
      .from('ofertas_negocios')
      .select('*')
      .eq('estado','publicada')
      .eq('activa',true)
      .order('aprobado_en',{ascending:false,nullsFirst:false})
      .limit(100);
    if (error) throw error;
    state.offers = offers || [];

    const ids = [...new Set(state.offers.map(o=>o.comercio_id).filter(Boolean))];
    if (ids.length) {
      const {data:businesses,error:businessError} = await supabase
        .from('negocios')
        .select('id,slug,nombre_comercial,categoria,logo_url,distrito,verificado,destacado,estado')
        .in('id',ids);
      if (businessError) throw businessError;
      (businesses || []).forEach(b=>state.businesses.set(b.id,b));
    }

    await loadSaved();
    const districts = [...new Set(state.offers.map(o=>o.distrito || businessFor(o).distrito).filter(Boolean))].sort();
    $('#offerDistrict').innerHTML = '<option value="">Todos los distritos</option>' + districts.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
    const localZone = localStorage.getItem('mizona_zona');
    if (localZone && districts.some(d=>normalize(d)===normalize(localZone))) {
      $('#offerDistrict').value = districts.find(d=>normalize(d)===normalize(localZone));
      state.district = $('#offerDistrict').value;
    }

    const discounts = state.offers.map(discountFor).filter(Boolean);
    $('#activeOfferCount').textContent = state.offers.length;
    $('#averageDiscount').textContent = discounts.length ? `${Math.round(discounts.reduce((a,b)=>a+b,0)/discounts.length)}%` : '0%';
    renderBusinesses();
    render();
  } catch (error) {
    const message = /does not exist|relation/i.test(error.message || '')
      ? 'Primero ejecuta el archivo sql/fase4_negocios_ofertas.sql en Supabase.'
      : `No se pudieron cargar las ofertas: ${error.message}`;
    $('#offerGrid').innerHTML = `<div class="bo-card bo-empty" style="grid-column:1/-1"><i class="ti ti-database-off"></i><strong>Catálogo todavía no disponible</strong><span>${esc(message)}</span></div>`;
    status(message,'error');
  }
}

async function toggleSave(id, button) {
  if (!state.user) {
    location.href = `login.html?next=${encodeURIComponent(`ofertas.html`)}`;
    return;
  }
  button.disabled = true;
  try {
    if (state.saved.has(id)) {
      const {error}=await supabase.from('ofertas_guardadas').delete().eq('oferta_id',id).eq('usuario_id',state.user.id);
      if(error) throw error;
      state.saved.delete(id);
      status('Oferta eliminada de tus guardados.','ok');
    } else {
      const {error}=await supabase.from('ofertas_guardadas').insert({oferta_id:id,usuario_id:state.user.id});
      if(error) throw error;
      state.saved.add(id);
      status('Oferta guardada.','ok');
    }
    render();
  } catch(error) { status(error.message || 'No se pudo guardar la oferta.','error'); }
  finally { button.disabled=false; }
}

async function claimCoupon(id, button) {
  if (!state.user) {
    location.href = `login.html?next=${encodeURIComponent(`ofertas.html`)}`;
    return;
  }
  button.disabled=true;
  button.textContent='Generando…';
  try {
    const {data,error}=await supabase.rpc('reclamar_cupon',{p_oferta_id:id});
    if(error) throw error;
    const offer=state.offers.find(o=>o.id===id);
    $('#couponContent').innerHTML=`<div style="text-align:center;padding:8px 4px 4px">
      <div style="width:64px;height:64px;margin:0 auto 12px;display:grid;place-items:center;border-radius:18px;background:#F2EDFF;color:#6D35E8;font-size:30px"><i class="ti ti-ticket"></i></div>
      <h3 style="margin:0 0 7px">${esc(offer?.titulo || 'Cupón MiZona')}</h3>
      <p style="color:#68788D;font-size:12px">Presenta este código en el negocio antes de la fecha de vencimiento.</p>
      <div style="margin:18px auto;padding:15px;border:2px dashed #BFA9F5;border-radius:13px;background:#FCFAFF;color:#5B24D6;font-size:24px;font-weight:900;letter-spacing:2px">${esc(data.codigo)}</div>
      <button class="bo-primary-btn" id="copyCoupon" type="button"><i class="ti ti-copy"></i> Copiar código</button>
    </div>`;
    $('#couponModal').classList.add('open');
    $('#copyCoupon')?.addEventListener('click',async()=>{await navigator.clipboard?.writeText(data.codigo);status('Código copiado.','ok');});
    const {count}=await supabase.from('cupones_clientes').select('id',{count:'exact',head:true}).eq('usuario_id',state.user.id);
    $('#savedCouponCount').textContent=count??0;
  } catch(error) { status(error.message || 'No se pudo obtener el cupón.','error'); }
  finally { button.disabled=false; button.innerHTML='<i class="ti ti-ticket"></i> Obtener cupón'; }
}

function bindDynamicActions() {
  $$('[data-save]').forEach(btn=>btn.addEventListener('click',()=>toggleSave(btn.dataset.save,btn)));
  $$('[data-coupon]').forEach(btn=>btn.addEventListener('click',()=>claimCoupon(btn.dataset.coupon,btn)));
}

$('#offerSearch')?.addEventListener('input',e=>{state.query=e.target.value.trim();state.shown=12;render();});
$('#offerSort')?.addEventListener('change',e=>{state.sort=e.target.value;render();});
$('#offerDistrict')?.addEventListener('change',e=>{state.district=e.target.value;state.shown=12;render();});
$('#offerCategories')?.addEventListener('click',e=>{
  const btn=e.target.closest('[data-category]'); if(!btn)return;
  $$('.bo-category').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
  state.category=btn.dataset.category; state.shown=12; render();
});
$('#loadMoreOffers')?.addEventListener('click',()=>{state.shown+=12;render();});
$$('[data-close-modal]').forEach(btn=>btn.addEventListener('click',()=>btn.closest('.bo-modal-backdrop').classList.remove('open')));
$('#couponModal')?.addEventListener('click',e=>{if(e.target.id==='couponModal')e.currentTarget.classList.remove('open');});

loadCatalog();
