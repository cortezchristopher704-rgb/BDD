let clientes = [];      // aquí guardamos la lista que baja de Supabase
let idEditando = null;  // null = estamos creando; con número = estamos editando ese cliente

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const modal = document.getElementById('modal');
const formCliente = document.getElementById('form-cliente');
const modalTitulo = document.getElementById('modal-titulo');
const formError = document.getElementById('form-error');
const btnGuardar = document.getElementById('btn-guardar');
const toast = document.getElementById('toast');

// ---------- Mensajitos de confirmación / error ----------
let temporizadorToast;
function mostrarMensaje(texto, esError = false) {
  toast.textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ---------- Leer clientes (SELECT) ----------
async function cargarClientes() {
  const { data, error } = await supabaseClient
    .from('cliente')
    .select('*')
    .order('id_cliente', { ascending: true });

  if (error) {
    mostrarMensaje('No se pudieron cargar los clientes.', true);
    return;
  }

  clientes = data;
  renderizar();
}

// ---------- Dibujar la tabla (aplicando buscador y filtro) ----------
function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtrados = clientes.filter((c) => {
    const coincideTexto = [c.nombre, c.telefono, c.email, c.direccioncliente]
      .some((valor) => (valor || '').toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || c.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay clientes que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map((c) => `
    <tr>
      <td>${escaparHtml(c.nombre)}</td>
      <td>${escaparHtml(c.telefono) || '—'}</td>
      <td>${escaparHtml(c.email) || '—'}</td>
      <td>${escaparHtml(c.direccioncliente) || '—'}</td>
      <td><span class="badge badge-${c.estatus}">${c.estatus}</span></td>
      <td class="acciones">
        <button class="link-btn" data-accion="editar" data-id="${c.id_cliente}">Editar</button>
        <button class="link-btn" data-accion="estatus" data-id="${c.id_cliente}">
          ${c.estatus === 'activo' ? 'Desactivar' : 'Reactivar'}
        </button>
      </td>
    </tr>
  `).join('');
}

// Un solo "oyente" para todos los botones de la tabla (en vez de uno por fila)
tbody.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'editar') abrirModal(id);
  if (boton.dataset.accion === 'estatus') cambiarEstatus(id);
});

buscador.addEventListener('input', renderizar);
filtroEstatus.addEventListener('change', renderizar);

// ---------- Ventana emergente (crear / editar) ----------
function abrirModal(id = null) {
  idEditando = id;
  formError.classList.remove('visible');
  formCliente.reset();

  if (id === null) {
    modalTitulo.textContent = 'Nuevo cliente';
  } else {
    modalTitulo.textContent = 'Editar cliente';
    const c = clientes.find((cliente) => cliente.id_cliente === id);
    document.getElementById('nombre').value = c.nombre || '';
    document.getElementById('telefono').value = c.telefono || '';
    document.getElementById('email').value = c.email || '';
    document.getElementById('direccion').value = c.direccioncliente || '';
  }

  modal.classList.add('visible');
  document.getElementById('nombre').focus();
}

function cerrarModal() {
  modal.classList.remove('visible');
}

document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal());
document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
modal.addEventListener('click', (evento) => {
  if (evento.target === modal) cerrarModal(); // clic en el fondo oscuro
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') cerrarModal();
});

// Si un campo opcional viene vacío, guardamos NULL en la base (no texto vacío)
function valorOpcional(idCampo) {
  const valor = document.getElementById(idCampo).value.trim();
  return valor === '' ? null : valor;
}

// ---------- Guardar (INSERT o UPDATE) ----------
formCliente.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const campos = {
    nombre: document.getElementById('nombre').value.trim(),
    telefono: valorOpcional('telefono'),
    email: valorOpcional('email'),
    direccioncliente: valorOpcional('direccion'),
  };

  if (!campos.nombre) {
    formError.textContent = 'El nombre es obligatorio.';
    formError.classList.add('visible');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  let error;
  if (idEditando === null) {
    ({ error } = await supabaseClient.from('cliente').insert(campos));
  } else {
    // fecha_modificacion no se actualiza sola, así que la mandamos nosotros
    ({ error } = await supabaseClient
      .from('cliente')
      .update({ ...campos, fecha_modificacion: new Date().toISOString() })
      .eq('id_cliente', idEditando));
  }

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar';

  if (error) {
    formError.textContent = 'No se pudo guardar: ' + error.message;
    formError.classList.add('visible');
    return;
  }

  cerrarModal();
  mostrarMensaje(idEditando === null ? 'Cliente registrado.' : 'Cliente actualizado.');
  cargarClientes();
});

// ---------- Activar / desactivar (en vez de borrar de verdad) ----------
async function cambiarEstatus(id) {
  const c = clientes.find((cliente) => cliente.id_cliente === id);
  const nuevoEstatus = c.estatus === 'activo' ? 'inactivo' : 'activo';

  if (nuevoEstatus === 'inactivo' && !confirm(`¿Desactivar a ${c.nombre}?`)) return;

  const { error } = await supabaseClient
    .from('cliente')
    .update({ estatus: nuevoEstatus, fecha_modificacion: new Date().toISOString() })
    .eq('id_cliente', id);

  if (error) {
    mostrarMensaje('No se pudo cambiar el estatus.', true);
    return;
  }

  mostrarMensaje(nuevoEstatus === 'activo' ? 'Cliente reactivado.' : 'Cliente desactivado.');
  cargarClientes();
}

// ---------- Arranque ----------
if (empleadoActual) cargarClientes();
