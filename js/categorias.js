let categorias = [];
let idEditando = null;

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const modal = document.getElementById('modal');
const formCategoria = document.getElementById('form-categoria');
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

if (!esAdmin) {
  document.getElementById('subtitulo').textContent =
    'Solo lectura: únicamente el administrador puede modificar las categorías.';
}

async function cargarCategorias() {
  const { data, error } = await supabaseClient
    .from('categoria')
    .select('*')
    .order('id_categoria', { ascending: true });

  if (error) {
    mostrarMensaje('No se pudieron cargar las categorías.', true);
    return;
  }

  categorias = data;
  renderizar();
}

function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtradas = categorias.filter((c) => {
    const coincideTexto = (c.nombre_categoria || '').toLowerCase().includes(texto);
    const coincideEstatus = estatus === 'todos' || c.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtradas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No hay categorías que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtradas.map((c) => {
    const acciones = esAdmin ? `
      <button class="link-btn" data-accion="editar" data-id="${c.id_categoria}">Editar</button>
      <button class="link-btn" data-accion="estatus" data-id="${c.id_categoria}">
        ${c.estatus === 'activo' ? 'Desactivar' : 'Reactivar'}
      </button>` : '';

    return `
      <tr>
        <td>${escaparHtml(c.nombre_categoria)}</td>
        <td><span class="badge badge-${c.estatus}">${c.estatus}</span></td>
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
  formCategoria.reset();

  if (id === null) {
    modalTitulo.textContent = 'Nueva categoría';
  } else {
    modalTitulo.textContent = 'Editar categoría';
    const c = categorias.find((categoria) => categoria.id_categoria === id);
    document.getElementById('nombre-categoria').value = c.nombre_categoria || '';
  }

  modal.classList.add('visible');
  document.getElementById('nombre-categoria').focus();
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

formCategoria.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const campos = {
    nombre_categoria: document.getElementById('nombre-categoria').value.trim(),
  };

  if (!campos.nombre_categoria) {
    formError.textContent = 'El nombre de la categoría es obligatorio.';
    formError.classList.add('visible');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  let error;
  if (idEditando === null) {
    ({ error } = await supabaseClient.from('categoria').insert(campos));
  } else {
    ({ error } = await supabaseClient
      .from('categoria')
      .update({ ...campos, fecha_modificacion: new Date().toISOString() })
      .eq('id_categoria', idEditando));
  }

  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar';

  if (error) {
    // 23505 = violación de UNIQUE (ya existe una categoría con ese nombre)
    if (error.code === '23505') {
      formError.textContent = 'Ya existe una categoría con ese nombre.';
    } else if (error.code === '42501') {
      formError.textContent = 'No tienes permiso para modificar categorías.';
    } else {
      formError.textContent = 'No se pudo guardar: ' + error.message;
    }
    formError.classList.add('visible');
    return;
  }

  cerrarModal();
  mostrarMensaje(idEditando === null ? 'Categoría registrada.' : 'Categoría actualizada.');
  cargarCategorias();
});

async function cambiarEstatus(id) {
  const c = categorias.find((categoria) => categoria.id_categoria === id);
  const nuevoEstatus = c.estatus === 'activo' ? 'inactivo' : 'activo';

  if (nuevoEstatus === 'inactivo' && !confirm(`¿Desactivar la categoría "${c.nombre_categoria}"?`)) return;

  const { error } = await supabaseClient
    .from('categoria')
    .update({ estatus: nuevoEstatus, fecha_modificacion: new Date().toISOString() })
    .eq('id_categoria', id);

  if (error) {
    mostrarMensaje('No se pudo cambiar el estatus.', true);
    return;
  }

  mostrarMensaje(nuevoEstatus === 'activo' ? 'Categoría reactivada.' : 'Categoría desactivada.');
  cargarCategorias();
}

if (empleadoActual) cargarCategorias();
