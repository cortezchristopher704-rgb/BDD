let ventas = [];
let clientes = [];
let librosDisponibles = [];

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const btnNuevo = document.getElementById('btn-nuevo');
const modalVenta = document.getElementById('modal-venta');
const formVenta = document.getElementById('form-venta');
const formError = document.getElementById('form-error');
const btnGuardar = document.getElementById('btn-guardar');
const selectCliente = document.getElementById('cliente');
const contenedorLineas = document.getElementById('lineas');
const totalVentaEl = document.getElementById('total-venta');
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
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 4000);
}

document.getElementById('subtitulo').textContent = esAdmin
  ? 'Todas las ventas de la librería. Puedes registrar nuevas y cancelar las que sea necesario.'
  : 'Aquí ves las ventas que tú registraste y puedes registrar nuevas.';

// '2026-08-03T10:15:00' -> '03/08/2026 10:15'
function formatoFechaHora(texto) {
  if (!texto) return '—';
  const [fecha, hora = ''] = texto.split('T');
  return fecha.split('-').reverse().join('/') + ' ' + hora.slice(0, 5);
}

// ---------- Leer ventas (con cliente, empleado y sus libros) ----------
async function cargarVentas() {
  const { data, error } = await supabaseClient
    .from('venta')
    .select('id_venta, fecha_venta, estatus, cliente(nombre), empleado(nombre), detalle_venta(id_libro, cantidad, precio_unitario, libro(titulo))')
    .order('id_venta', { ascending: false });

  if (error) {
    mostrarMensaje('No se pudieron cargar las ventas.', true);
    return;
  }

  ventas = data.map((v) => ({
    ...v,
    total: v.detalle_venta.reduce((suma, d) => suma + d.cantidad * Number(d.precio_unitario), 0),
    piezas: v.detalle_venta.reduce((suma, d) => suma + d.cantidad, 0),
  }));

  renderizar();
}

// ---------- Dibujar la tabla ----------
function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtradas = ventas.filter((v) => {
    const campos = [
      String(v.id_venta),
      v.cliente ? v.cliente.nombre : 'sin cliente',
      v.empleado ? v.empleado.nombre : '',
      ...v.detalle_venta.map((d) => (d.libro ? d.libro.titulo : '')),
    ];
    const coincideTexto = campos.some((c) => c.toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || v.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay ventas que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map((v) => {
    const botonEstatus = esAdmin ? `
      <button class="link-btn" data-accion="estatus" data-id="${v.id_venta}">
        ${v.estatus === 'activo' ? 'Cancelar' : 'Reactivar'}
      </button>` : '';

    return `
      <tr>
        <td>#${v.id_venta}</td>
        <td>${formatoFechaHora(v.fecha_venta)}</td>
        <td>${v.cliente ? escaparHtml(v.cliente.nombre) : '<span class="muted">Mostrador</span>'}</td>
        <td>${v.empleado ? escaparHtml(v.empleado.nombre) : '—'}</td>
        <td>${v.piezas}</td>
        <td><strong>${formatoMoneda.format(v.total)}</strong></td>
        <td><span class="badge badge-${v.estatus}">${v.estatus === 'activo' ? 'activa' : 'cancelada'}</span></td>
        <td class="acciones">
          <button class="link-btn" data-accion="detalle" data-id="${v.id_venta}">Ver detalle</button>
          ${botonEstatus}
        </td>
      </tr>`;
  }).join('');
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

// ---------- Ver detalle de una venta ----------
function abrirDetalle(id) {
  const v = ventas.find((venta) => venta.id_venta === id);

  const filas = v.detalle_venta.map((d) => `
    <tr>
      <td>${escaparHtml(d.libro ? d.libro.titulo : 'Libro #' + d.id_libro)}</td>
      <td>${d.cantidad}</td>
      <td>${formatoMoneda.format(Number(d.precio_unitario))}</td>
      <td>${formatoMoneda.format(d.cantidad * Number(d.precio_unitario))}</td>
    </tr>`).join('');

  detalleContenido.innerHTML = `
    <h2>Venta #${v.id_venta}</h2>
    <dl class="detalle-meta">
      <dt>Fecha</dt><dd>${formatoFechaHora(v.fecha_venta)}</dd>
      <dt>Cliente</dt><dd>${v.cliente ? escaparHtml(v.cliente.nombre) : 'Mostrador (sin cliente)'}</dd>
      <dt>Atendió</dt><dd>${v.empleado ? escaparHtml(v.empleado.nombre) : '—'}</dd>
      <dt>Estatus</dt><dd>${v.estatus === 'activo' ? 'Activa' : 'Cancelada'}</dd>
    </dl>
    <table class="data-table">
      <thead><tr><th>Libro</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="total-venta"><span>Total</span><span>${formatoMoneda.format(v.total)}</span></div>
    <div class="modal-actions">
      <button type="button" class="btn-secondary" id="btn-cerrar-detalle">Cerrar</button>
    </div>`;

  document.getElementById('btn-cerrar-detalle').addEventListener('click', cerrarDetalle);
  modalDetalle.classList.add('visible');
}

function cerrarDetalle() {
  modalDetalle.classList.remove('visible');
}

// ---------- Nueva venta ----------
// Cada vez que se abre, volvemos a pedir clientes y libros para que las
// existencias que se ven estén al día.
async function cargarCatalogos() {
  const [resClientes, resLibros] = await Promise.all([
    supabaseClient.from('cliente').select('id_cliente, nombre').eq('estatus', 'activo').order('nombre'),
    supabaseClient.from('libro').select('id_libro, titulo, precio, stock').eq('estatus', 'activo').gt('stock', 0).order('titulo'),
  ]);

  if (resClientes.error || resLibros.error) return false;

  clientes = resClientes.data;
  librosDisponibles = resLibros.data;
  return true;
}

async function abrirNuevaVenta() {
  btnNuevo.disabled = true;
  const ok = await cargarCatalogos();
  btnNuevo.disabled = false;

  if (!ok) {
    mostrarMensaje('No se pudieron cargar los clientes o libros.', true);
    return;
  }
  if (librosDisponibles.length === 0) {
    mostrarMensaje('No hay libros con existencias para vender.', true);
    return;
  }

  formError.classList.remove('visible');
  formVenta.reset();

  selectCliente.innerHTML = '<option value="">Venta de mostrador (sin cliente)</option>' +
    clientes.map((c) => `<option value="${c.id_cliente}">${escaparHtml(c.nombre)}</option>`).join('');

  contenedorLineas.innerHTML = '';
  agregarLinea();

  modalVenta.classList.add('visible');
}

function agregarLinea() {
  const opciones = '<option value="">Elige un libro...</option>' + librosDisponibles.map((l) => `
    <option value="${l.id_libro}" data-precio="${l.precio}" data-stock="${l.stock}">
      ${escaparHtml(l.titulo)} — ${formatoMoneda.format(Number(l.precio))} (quedan ${l.stock})
    </option>`).join('');

  const fila = document.createElement('div');
  fila.className = 'linea';
  fila.innerHTML = `
    <select class="linea-libro" required>${opciones}</select>
    <input type="number" class="linea-cantidad" min="1" step="1" value="1" required>
    <span class="linea-subtotal">$0.00</span>
    <button type="button" class="link-btn linea-quitar" title="Quitar">✕</button>`;

  contenedorLineas.appendChild(fila);
  recalcular();
}

function recalcular() {
  let total = 0;

  contenedorLineas.querySelectorAll('.linea').forEach((fila) => {
    const select = fila.querySelector('.linea-libro');
    const inputCantidad = fila.querySelector('.linea-cantidad');
    const opcion = select.selectedOptions[0];

    const precio = opcion && opcion.dataset.precio ? Number(opcion.dataset.precio) : 0;
    // No dejamos pedir más de lo que hay en existencia
    inputCantidad.max = opcion && opcion.dataset.stock ? opcion.dataset.stock : '';

    const cantidad = parseInt(inputCantidad.value, 10) || 0;
    const subtotal = precio * cantidad;

    fila.querySelector('.linea-subtotal').textContent = formatoMoneda.format(subtotal);
    total += subtotal;
  });

  totalVentaEl.textContent = formatoMoneda.format(total);
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
btnNuevo.addEventListener('click', abrirNuevaVenta);
document.getElementById('btn-cancelar').addEventListener('click', () => modalVenta.classList.remove('visible'));

// Cerrar ventanas con clic en el fondo o con Escape
[modalVenta, modalDetalle].forEach((modal) => {
  modal.addEventListener('click', (evento) => {
    if (evento.target === modal) modal.classList.remove('visible');
  });
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    modalVenta.classList.remove('visible');
    modalDetalle.classList.remove('visible');
  }
});

// ---------- Guardar la venta ----------
formVenta.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const lineas = [];
  contenedorLineas.querySelectorAll('.linea').forEach((fila) => {
    const idLibro = Number(fila.querySelector('.linea-libro').value);
    const cantidad = parseInt(fila.querySelector('.linea-cantidad').value, 10);
    if (idLibro) lineas.push({ id_libro: idLibro, cantidad });
  });

  if (lineas.length === 0) {
    formError.textContent = 'Agrega al menos un libro.';
    formError.classList.add('visible');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  // Una sola llamada: la base de datos guarda la venta, sus libros y descuenta
  // el stock. Si algo falla (por ejemplo, falta stock), no se guarda nada.
  const { data: idVenta, error } = await supabaseClient.rpc('registrar_venta', {
    p_id_cliente: selectCliente.value ? Number(selectCliente.value) : null,
    p_lineas: lineas,
  });

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Registrar venta';

  if (error) {
    formError.textContent = error.code === '42501'
      ? 'No tienes permiso para registrar ventas.'
      : error.message;
    formError.classList.add('visible');
    return;
  }

  modalVenta.classList.remove('visible');
  mostrarMensaje(`Venta #${idVenta} registrada.`);
  cargarVentas();
});

// ---------- Cancelar / reactivar (solo Admin) ----------
async function cambiarEstatus(id) {
  if (!esAdmin) return;

  const v = ventas.find((venta) => venta.id_venta === id);
  const cancelando = v.estatus === 'activo';

  const pregunta = cancelando
    ? `¿Cancelar la venta #${id}? Los libros regresarán al inventario.`
    : `¿Reactivar la venta #${id}? Los libros se descontarán otra vez del inventario.`;
  if (!confirm(pregunta)) return;

  const { error } = await supabaseClient
    .from('venta')
    .update({
      estatus: cancelando ? 'inactivo' : 'activo',
      fecha_modificacion: new Date().toISOString(),
    })
    .eq('id_venta', id);

  if (error) {
    mostrarMensaje(error.message, true);
    return;
  }

  mostrarMensaje(cancelando ? 'Venta cancelada. El stock se regresó.' : 'Venta reactivada.');
  cargarVentas();
}

if (empleadoActual) cargarVentas();
