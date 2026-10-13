// Página solo para Admin (RLS ya bloquea los datos; esto evita una pantalla rota)
if (!esAdmin) {
  window.location.href = 'dashboard.html';
}

let compras = [];
let proveedores = [];
let libros = [];

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const btnNuevo = document.getElementById('btn-nuevo');
const modalCompra = document.getElementById('modal-compra');
const formCompra = document.getElementById('form-compra');
const formError = document.getElementById('form-error');
const btnGuardar = document.getElementById('btn-guardar');
const selectProveedor = document.getElementById('proveedor');
const contenedorLineas = document.getElementById('lineas');
const totalCompraEl = document.getElementById('total-compra');
const modalDetalle = document.getElementById('modal-detalle');
const detalleContenido = document.getElementById('detalle-contenido');
const toast = document.getElementById('toast');

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let temporizadorToast;
function mostrarMensaje(texto, esError = false) {
  toast.textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 5000);
}

// '2026-09-30' -> '30/09/2026'
function formatoFecha(texto) {
  return texto ? texto.split('-').reverse().join('/') : '—';
}

// ---------- Leer compras (con proveedor y sus libros) ----------
async function cargarCompras() {
  const { data, error } = await supabaseClient
    .from('compra')
    .select('id_compra, fecha_compra, estatus, proveedor(nombre_empresa), detalle_compra(id_libro, cantidad, precio_unitario, libro(titulo))')
    .order('id_compra', { ascending: false });

  if (error) {
    mostrarMensaje('No se pudieron cargar las compras.', true);
    return;
  }

  compras = data.map((c) => ({
    ...c,
    total: c.detalle_compra.reduce((suma, d) => suma + d.cantidad * Number(d.precio_unitario), 0),
    piezas: c.detalle_compra.reduce((suma, d) => suma + d.cantidad, 0),
  }));

  renderizar();
}

// ---------- Dibujar la tabla ----------
function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtradas = compras.filter((c) => {
    const campos = [
      String(c.id_compra),
      c.proveedor ? c.proveedor.nombre_empresa : '',
      ...c.detalle_compra.map((d) => (d.libro ? d.libro.titulo : '')),
    ];
    const coincideTexto = campos.some((campo) => campo.toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || c.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay compras que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map((c) => `
    <tr>
      <td>#${c.id_compra}</td>
      <td>${formatoFecha(c.fecha_compra)}</td>
      <td>${c.proveedor ? escaparHtml(c.proveedor.nombre_empresa) : '—'}</td>
      <td>${c.piezas}</td>
      <td><strong>${formatoMoneda.format(c.total)}</strong></td>
      <td><span class="badge badge-${c.estatus}">${c.estatus === 'activo' ? 'activa' : 'cancelada'}</span></td>
      <td class="acciones">
        <button class="link-btn" data-accion="detalle" data-id="${c.id_compra}">Ver detalle</button>
        <button class="link-btn" data-accion="estatus" data-id="${c.id_compra}">
          ${c.estatus === 'activo' ? 'Cancelar' : 'Reactivar'}
        </button>
      </td>
    </tr>
  `).join('');
}

tbody.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'detalle') abrirDetalle(id);
  if (boton.dataset.accion === 'estatus') cambiarEstatus(id);
});

buscador.addEventListener('input', renderizar);
filtroEstatus.addEventListener('change', renderizar);

// ---------- Ver detalle de una compra ----------
function abrirDetalle(id) {
  const c = compras.find((compra) => compra.id_compra === id);

  const filas = c.detalle_compra.map((d) => `
    <tr>
      <td>${escaparHtml(d.libro ? d.libro.titulo : 'Libro #' + d.id_libro)}</td>
      <td>${d.cantidad}</td>
      <td>${formatoMoneda.format(Number(d.precio_unitario))}</td>
      <td>${formatoMoneda.format(d.cantidad * Number(d.precio_unitario))}</td>
    </tr>`).join('');

  detalleContenido.innerHTML = `
    <h2>Compra #${c.id_compra}</h2>
    <dl class="detalle-meta">
      <dt>Fecha</dt><dd>${formatoFecha(c.fecha_compra)}</dd>
      <dt>Proveedor</dt><dd>${c.proveedor ? escaparHtml(c.proveedor.nombre_empresa) : '—'}</dd>
      <dt>Estatus</dt><dd>${c.estatus === 'activo' ? 'Activa' : 'Cancelada'}</dd>
    </dl>
    <table class="data-table">
      <thead><tr><th>Libro</th><th>Cant.</th><th>Costo</th><th>Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="total-venta"><span>Total</span><span>${formatoMoneda.format(c.total)}</span></div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="btn-cerrar-detalle">Cerrar</button>
    </div>`;

  document.getElementById('btn-cerrar-detalle').addEventListener('click', cerrarDetalle);
  modalDetalle.classList.add('visible');
}

function cerrarDetalle() {
  modalDetalle.classList.remove('visible');
}

// ---------- Nueva compra ----------
// Aquí aparecen TODOS los libros activos (incluso los que tienen 0 de stock,
// porque justamente para eso se compra).
async function cargarCatalogos() {
  const [resProveedores, resLibros] = await Promise.all([
    supabaseClient.from('proveedor').select('id_proveedor, nombre_empresa').eq('estatus', 'activo').order('nombre_empresa'),
    supabaseClient.from('libro').select('id_libro, titulo, precio, stock').eq('estatus', 'activo').order('titulo'),
  ]);

  if (resProveedores.error || resLibros.error) return false;

  proveedores = resProveedores.data;
  libros = resLibros.data;
  return true;
}

async function abrirNuevaCompra() {
  btnNuevo.disabled = true;
  const ok = await cargarCatalogos();
  btnNuevo.disabled = false;

  if (!ok) {
    mostrarMensaje('No se pudieron cargar los proveedores o libros.', true);
    return;
  }
  if (proveedores.length === 0) {
    mostrarMensaje('Primero registra al menos un proveedor activo.', true);
    return;
  }

  formError.classList.remove('visible');
  formCompra.reset();

  selectProveedor.innerHTML = '<option value="">Elige un proveedor...</option>' +
    proveedores.map((p) => `<option value="${p.id_proveedor}">${escaparHtml(p.nombre_empresa)}</option>`).join('');

  contenedorLineas.innerHTML = '';
  agregarLinea();

  modalCompra.classList.add('visible');
}

function agregarLinea() {
  const opciones = '<option value="">Elige un libro...</option>' + libros.map((l) => `
    <option value="${l.id_libro}">
      ${escaparHtml(l.titulo)} (stock ${l.stock} · se vende en ${formatoMoneda.format(Number(l.precio))})
    </option>`).join('');

  const fila = document.createElement('div');
  fila.className = 'linea linea-compra';
  fila.innerHTML = `
    <select class="linea-libro" required>${opciones}</select>
    <input type="number" class="linea-cantidad" min="1" step="1" value="1" required>
    <input type="number" class="linea-costo" min="0.01" step="0.01" placeholder="Costo" required>
    <span class="linea-subtotal">$0.00</span>
    <button type="button" class="link-btn linea-quitar" title="Quitar">✕</button>`;

  contenedorLineas.appendChild(fila);
  recalcular();
}

function recalcular() {
  let total = 0;

  contenedorLineas.querySelectorAll('.linea').forEach((fila) => {
    const cantidad = parseInt(fila.querySelector('.linea-cantidad').value, 10) || 0;
    const costo = parseFloat(fila.querySelector('.linea-costo').value) || 0;
    const subtotal = cantidad * costo;

    fila.querySelector('.linea-subtotal').textContent = formatoMoneda.format(subtotal);
    total += subtotal;
  });

  totalCompraEl.textContent = formatoMoneda.format(total);
}

contenedorLineas.addEventListener('input', recalcular);
contenedorLineas.addEventListener('change', recalcular);
contenedorLineas.addEventListener('click', (evento) => {
  if (!evento.target.closest('.linea-quitar')) return;

  const filas = contenedorLineas.querySelectorAll('.linea');
  if (filas.length > 1) {
    evento.target.closest('.linea').remove();
  }
  recalcular();
});

document.getElementById('btn-agregar-linea').addEventListener('click', agregarLinea);
btnNuevo.addEventListener('click', abrirNuevaCompra);
document.getElementById('btn-cancelar').addEventListener('click', () => modalCompra.classList.remove('visible'));

[modalCompra, modalDetalle].forEach((modal) => {
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.classList.remove('visible');
  });
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    modalCompra.classList.remove('visible');
    modalDetalle.classList.remove('visible');
  }
});

// ---------- Guardar la compra ----------
formCompra.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const lineas = [];
  contenedorLineas.querySelectorAll('.linea').forEach((fila) => {
    const idLibro = Number(fila.querySelector('.linea-libro').value);
    const cantidad = parseInt(fila.querySelector('.linea-cantidad').value, 10);
    const precioUnitario = parseFloat(fila.querySelector('.linea-costo').value);
    if (idLibro) lineas.push({ id_libro: idLibro, cantidad, precio_unitario: precioUnitario });
  });

  if (lineas.length === 0) {
    formError.textContent = 'Agrega al menos un libro.';
    formError.classList.add('visible');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  // Una sola llamada: la base de datos guarda la compra, sus libros y suma
  // el stock. Si algo falla, no se guarda nada.
  const { data: idCompra, error } = await supabaseClient.rpc('registrar_compra', {
    p_id_proveedor: Number(selectProveedor.value),
    p_lineas: lineas,
  });

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Registrar compra';

  if (error) {
    formError.textContent = error.code === '42501'
      ? 'No tienes permiso para registrar compras.'
      : error.message;
    formError.classList.add('visible');
    return;
  }

  modalCompra.classList.remove('visible');
  mostrarMensaje(`Compra #${idCompra} registrada. El stock ya se actualizó.`);
  cargarCompras();
});

// ---------- Cancelar / reactivar ----------
async function cambiarEstatus(id) {
  const c = compras.find((compra) => compra.id_compra === id);
  const cancelando = c.estatus === 'activo';

  const pregunta = cancelando
    ? `¿Cancelar la compra #${id}? Los libros se restarán del inventario.`
    : `¿Reactivar la compra #${id}? Los libros se sumarán otra vez al inventario.`;
  if (!confirm(pregunta)) return;

  const { error } = await supabaseClient
    .from('compra')
    .update({
      estatus: cancelando ? 'inactivo' : 'activo',
      fecha_modificacion: new Date().toISOString(),
    })
    .eq('id_compra', id);

  if (error) {
    // Si ya se vendieron libros de esta compra, restarlos dejaría stock negativo
    mostrarMensaje(
      cancelando ? `No se pudo cancelar: ${error.message} (puede que ya se hayan vendido).` : error.message,
      true
    );
    return;
  }

  mostrarMensaje(cancelando ? 'Compra cancelada. El stock se ajustó.' : 'Compra reactivada.');
  cargarCompras();
}

if (esAdmin) cargarCompras();
