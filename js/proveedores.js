// Página solo para Admin (RLS ya bloquea los datos; esto evita una pantalla rota)
if (!esAdmin) {
  window.location.href = 'dashboard.html';
}

let proveedores = [];
let idEditando = null;

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const modal = document.getElementById('modal');
const formProveedor = document.getElementById('form-proveedor');
const modalTitulo = document.getElementById('modal-titulo');
const formError = document.getElementById('form-error');
const btnGuardar = document.getElementById('btn-guardar');
const toast = document.getElementById('toast');

let temporizadorToast;
function mostrarMensaje(texto, esError = false) {
  toast.textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 3000);
}

async function cargarProveedores() {
  const { data, error } = await supabaseClient
    .from('proveedor')
    .select('*')
    .order('id_proveedor', { ascending: true });

  if (error) {
    mostrarMensaje('No se pudieron cargar los proveedores.', true);
    return;
  }

  proveedores = data;
  renderizar();
}

function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtrados = proveedores.filter((p) => {
    const coincideTexto = [p.nombre_empresa, p.telefono, p.email, p.direccionprov]
      .some((valor) => (valor || '').toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || p.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No hay proveedores que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map((p) => `
    <tr>
      <td>${escaparHtml(p.nombre_empresa)}</td>
      <td>${escaparHtml(p.telefono) || '—'}</td>
      <td>${escaparHtml(p.email) || '—'}</td>
      <td>${escaparHtml(p.direccionprov) || '—'}</td>
      <td><span class="badge badge-${p.estatus}">${p.estatus}</span></td>
      <td class="acciones">
        <button class="link-btn" data-accion="editar" data-id="${p.id_proveedor}">Editar</button>
        <button class="link-btn" data-accion="estatus" data-id="${p.id_proveedor}">
          ${p.estatus === 'activo' ? 'Desactivar' : 'Reactivar'}
        </button>
      </td>
    </tr>
  `).join('');
}

tbody.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'editar') abrirModal(id);
  if (boton.dataset.accion === 'estatus') cambiarEstatus(id);
});

buscador.addEventListener('input', renderizar);
filtroEstatus.addEventListener('change', renderizar);

function abrirModal(id = null) {
  idEditando = id;
  formError.classList.remove('visible');
  formProveedor.reset();

  if (id === null) {
    modalTitulo.textContent = 'Nuevo proveedor';
  } else {
    modalTitulo.textContent = 'Editar proveedor';
    const p = proveedores.find((proveedor) => proveedor.id_proveedor === id);
    document.getElementById('nombre-empresa').value = p.nombre_empresa || '';
    document.getElementById('telefono').value = p.telefono || '';
    document.getElementById('email').value = p.email || '';
    document.getElementById('direccion').value = p.direccionprov || '';
  }

  modal.classList.add('visible');
  document.getElementById('nombre-empresa').focus();
}

function cerrarModal() {
  modal.classList.remove('visible');
}

document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal());
document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
modal.addEventListener('click', (evento) => {
  if (evento.target === modal) cerrarModal();
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') cerrarModal();
});

function valorOpcional(idCampo) {
  const valor = document.getElementById(idCampo).value.trim();
  return valor === '' ? null : valor;
}

formProveedor.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const campos = {
    nombre_empresa: document.getElementById('nombre-empresa').value.trim(),
    telefono: valorOpcional('telefono'),
    email: valorOpcional('email'),
    direccionprov: valorOpcional('direccion'),
  };

  if (!campos.nombre_empresa) {
    formError.textContent = 'El nombre de la empresa es obligatorio.';
    formError.classList.add('visible');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  let error;
  if (idEditando === null) {
    ({ error } = await supabaseClient.from('proveedor').insert(campos));
  } else {
    ({ error } = await supabaseClient
      .from('proveedor')
      .update({ ...campos, fecha_modificacion: new Date().toISOString() })
      .eq('id_proveedor', idEditando));
  }

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar';

  if (error) {
    formError.textContent = error.code === '42501'
      ? 'No tienes permiso para modificar proveedores.'
      : 'No se pudo guardar: ' + error.message;
    formError.classList.add('visible');
    return;
  }

  cerrarModal();
  mostrarMensaje(idEditando === null ? 'Proveedor registrado.' : 'Proveedor actualizado.');
  cargarProveedores();
});

async function cambiarEstatus(id) {
  const p = proveedores.find((proveedor) => proveedor.id_proveedor === id);
  const nuevoEstatus = p.estatus === 'activo' ? 'inactivo' : 'activo';

  if (nuevoEstatus === 'inactivo' && !confirm(`¿Desactivar a ${p.nombre_empresa}?`)) return;

  const { error } = await supabaseClient
    .from('proveedor')
    .update({ estatus: nuevoEstatus, fecha_modificacion: new Date().toISOString() })
    .eq('id_proveedor', id);

  if (error) {
    mostrarMensaje('No se pudo cambiar el estatus.', true);
    return;
  }

  mostrarMensaje(nuevoEstatus === 'activo' ? 'Proveedor reactivado.' : 'Proveedor desactivado.');
  cargarProveedores();
}

if (esAdmin) cargarProveedores();
