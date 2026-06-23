-- ============================================================
-- MiZona.pe — Sistema de Cupones QR
-- Ejecutar después de schema_mizona_fase1b.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ofertas_negocios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL CHECK (char_length(titulo) BETWEEN 5 AND 100),
  descripcion TEXT,
  tipo TEXT NOT NULL DEFAULT 'descuento'
    CHECK (tipo IN ('descuento','precio','combo','servicio','evento','otro')),
  modalidad TEXT NOT NULL DEFAULT 'tienda'
    CHECK (modalidad IN ('tienda','cupon','delivery','whatsapp','online','mixto')),
  descuento_texto TEXT,
  vence_en TIMESTAMPTZ,
  recurrente TEXT DEFAULT NULL,
  distrito TEXT NOT NULL,
  activa BOOLEAN DEFAULT TRUE,
  es_boost BOOLEAN DEFAULT FALSE,
  vistas INT DEFAULT 0,
  clics INT DEFAULT 0,
  whatsapp_recibidos INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cupones_qr (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id UUID NOT NULL REFERENCES public.ofertas_negocios(id) ON DELETE CASCADE,
  negocio_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  codigo TEXT UNIQUE NOT NULL,
  stock_total INT DEFAULT 10,
  stock_usado INT DEFAULT 0,
  activo BOOLEAN DEFAULT TRUE,
  vence_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cupones_usos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cupon_id UUID NOT NULL REFERENCES public.cupones_qr(id) ON DELETE CASCADE,
  vecino_id UUID NOT NULL REFERENCES public.perfiles(id) ON DELETE CASCADE,
  negocio_id UUID NOT NULL REFERENCES public.perfiles(id),
  usado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cupon_id, vecino_id)
);

-- Función atómica para aplicar cupón
CREATE OR REPLACE FUNCTION public.aplicar_cupon(
  p_codigo TEXT,
  p_vecino UUID
) RETURNS JSON AS $$
DECLARE
  v_cupon cupones_qr%ROWTYPE;
  v_restante INT;
BEGIN
  SELECT * INTO v_cupon FROM public.cupones_qr
  WHERE codigo = p_codigo AND activo = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Cupón no existe o está inactivo');
  END IF;
  IF v_cupon.vence_en < NOW() THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Cupón vencido');
  END IF;
  IF v_cupon.stock_usado >= v_cupon.stock_total THEN
    RETURN json_build_object('ok', FALSE, 'error', 'Sin stock disponible — todos los cupones fueron usados');
  END IF;

  INSERT INTO public.cupones_usos(cupon_id, vecino_id, negocio_id)
  VALUES(v_cupon.id, p_vecino, v_cupon.negocio_id);

  UPDATE public.cupones_qr SET stock_usado = stock_usado + 1 WHERE id = v_cupon.id;

  v_restante := v_cupon.stock_total - v_cupon.stock_usado - 1;
  RETURN json_build_object('ok', TRUE, 'restante', v_restante, 'total', v_cupon.stock_total);

EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('ok', FALSE, 'error', 'Este vecino ya usó el cupón anteriormente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ofertas_distrito ON public.ofertas_negocios(distrito);
CREATE INDEX IF NOT EXISTS idx_ofertas_activa ON public.ofertas_negocios(activa);
CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON public.cupones_qr(codigo);
CREATE INDEX IF NOT EXISTS idx_cupones_usos_cupon ON public.cupones_usos(cupon_id);
