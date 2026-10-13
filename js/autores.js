let autores = [];
let idEditando = null;

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const modal = document.getElementById('modal');
const formAutor = document.getElementById('form-autor');
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

// Si no es Admin, la página queda en modo "solo lectura"
if (!esAdmin) {
  document.getElementById('subtitulo').textContent =
    'Solo lectura: únicamente el administrador puede modificar los autores.';
}

async function cargarAutores() {
  const { data, error } = await supabaseClient
    .from('autor')
    .select('*')
    .order('id_autor', { ascending: true });

  if (error) {
    mostrarMensaje('No se pudieron cargar los autores.', true);
    return;
  }

  autores = data;
  renderizar();
}

function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtrados = autores.filter((a) => {
    const coincideTexto = [a.nombre, a.nacionalidad]
      .some((valor) => (valor || '').toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || a.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay autores que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map((a) => {
    // Los botones de modificar solo se dibujan si el usuario es Admin
    const acciones = esAdmin ? `
      <button class="link-btn" data-accion="editar" data-id="${a.id_autor}">Editar</button>
      <button class="link-btn" data-accion="estatus" data-id="${a.id_autor}">
        ${a.estatus === 'activo' ? 'Desactivar' : 'Reactivar'}
      </button>` : '';

    return `
      <tr>
        <td>${escaparHtml(a.nombre)}</td>
        <td>${escaparHtml(a.nacionalidad) || '—'}</td>
        <td><span class="badge badge-${a.estatus}">${a.estatus}</span></td>
        <td class="acciones">${acciones}</td>
      </tr>`;
  }).join('');
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
  formAutor.reset();

  if (id === null) {
    modalTitulo.textContent = 'Nuevo autor';
  } else {
    modalTitulo.textContent = 'Editar autor';
    const a = autores.find((autor) => autor.id_autor === id);
    document.getElementById('nombre').value = a.nombre || '';
    document.getElementById('nacionalidad').value = a.nacionalidad || '';
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
  if (evento.target === modal) cerrarModal();
});
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') cerrarModal();
});

function valorOpcional(idCampo) {
  const valor = document.getElementById(idCampo).value.trim();
  return valor === '' ? null : valor;
}

formAutor.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const campos = {
    nombre: document.getElementById('nombre').value.trim(),
    nacionalidad: valorOpcional('nacionalidad'),
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
    ({ error } = await supabaseClient.from('autor').insert(campos));
  } else {
    ({ error } = await supabaseClient
      .from('autor')
      .update({ ...campos, fecha_modificacion: new Date().toISOString() })
      .eq('id_autor', idEditando));
  }

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar';

  if (error) {
    formError.textContent = error.code === '42501'
      ? 'No tienes permiso para modificar autores.'
      : 'No se pudo guardar: ' + error.message;
    formError.classList.add('visible');
    return;
  }

  cerrarModal();
  mostrarMensaje(idEditando === null ? 'Autor registrado.' : 'Autor actualizado.');
  cargarAutores();
});

async function cambiarEstatus(id) {
  const a = autores.find((autor) => autor.id_autor === id);
  const nuevoEstatus = a.estatus === 'activo' ? 'inactivo' : 'activo';

  if (nuevoEstatus === 'inactivo' && !confirm(`¿Desactivar a ${a.nombre}?`)) return;

  const { error } = await supabaseClient
    .from('autor')
    .update({ estatus: nuevoEstatus, fecha_modificacion: new Date().toISOString() })
    .eq('id_autor', id);

  if (error) {
    mostrarMensaje('No se pudo cambiar el estatus.', true);
    return;
  }

  mostrarMensaje(nuevoEstatus === 'activo' ? 'Autor reactivado.' : 'Autor desactivado.');
  cargarAutores();
}

if (empleadoActual) cargarAutores();
