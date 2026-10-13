let libros = [];
let autores = [];       // catálogo de autores (para las casillas del formulario)
let categorias = [];    // catálogo de categorías (para las casillas del formulario)
let idEditando = null;

const STOCK_BAJO = 5;   // de aquí hacia abajo, el stock se pinta en rojo

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const modal = document.getElementById('modal');
const formLibro = document.getElementById('form-libro');
const modalTitulo = document.getElementById('modal-titulo');
const formError = document.getElementById('form-error');
const btnGuardar = document.getElementById('btn-guardar');
const toast = document.getElementById('toast');

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

let temporizadorToast;
function mostrarMensaje(texto, esError = false) {
  toast.textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 3500);
}

if (!esAdmin) {
  document.getElementById('subtitulo').textContent =
    'Solo lectura: únicamente el administrador puede modificar el catálogo.';
}

// '1967-05-30' -> '30/05/1967'
function formatoFecha(texto) {
  return texto ? texto.split('-').reverse().join('/') : '—';
}

// ---------- Leer libros, ya con sus autores y categorías ----------
// Una sola petición trae el libro + sus autores + sus categorías, porque
// Supabase sigue las llaves foráneas (libro -> libro_autor -> autor).
async function cargarLibros() {
  const { data, error } = await supabaseClient
    .from('libro')
    .select('*, libro_autor(autor(id_autor, nombre)), libro_categoria(categoria(id_categoria, nombre_categoria))')
    .order('id_libro', { ascending: true });

  if (error) {
    mostrarMensaje('No se pudieron cargar los libros.', true);
    return;
  }

  libros = data.map((l) => ({
    ...l,
    autoresLista: l.libro_autor.map((x) => x.autor).filter(Boolean),
    categoriasLista: l.libro_categoria.map((x) => x.categoria).filter(Boolean),
  }));

  renderizar();
}

// Los catálogos solo se necesitan para el formulario, o sea, solo para Admin
async function cargarCatalogos() {
  const [resAutores, resCategorias] = await Promise.all([
    supabaseClient.from('autor').select('id_autor, nombre, estatus').order('nombre'),
    supabaseClient.from('categoria').select('id_categoria, nombre_categoria, estatus').order('nombre_categoria'),
  ]);

  if (resAutores.error || resCategorias.error) {
    mostrarMensaje('No se pudieron cargar los autores o categorías.', true);
    return;
  }

  autores = resAutores.data;
  categorias = resCategorias.data;
}

// ---------- Dibujar la tabla ----------
function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtrados = libros.filter((l) => {
    const textoBusqueda = [
      l.titulo,
      l.isbn,
      ...l.autoresLista.map((a) => a.nombre),
      ...l.categoriasLista.map((c) => c.nombre_categoria),
    ];
    const coincideTexto = textoBusqueda.some((valor) => (valor || '').toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || l.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay libros que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map((l) => {
    const acciones = esAdmin ? `
      <button class="link-btn" data-accion="editar" data-id="${l.id_libro}">Editar</button>
      <button class="link-btn" data-accion="estatus" data-id="${l.id_libro}">
        ${l.estatus === 'activo' ? 'Desactivar' : 'Reactivar'}
      </button>` : '';

    const autoresTxt = l.autoresLista.length
      ? l.autoresLista.map((a) => escaparHtml(a.nombre)).join(', ')
      : '—';

    const categoriasHtml = l.categoriasLista.length
      ? l.categoriasLista.map((c) => `<span class="chip">${escaparHtml(c.nombre_categoria)}</span>`).join('')
      : '—';

    const claseStock = l.stock <= STOCK_BAJO ? 'stock-bajo' : '';

    return `
      <tr>
        <td><strong>${escaparHtml(l.titulo)}</strong><br><small>${formatoFecha(l.fecha_publicacion)}</small></td>
        <td>${autoresTxt}</td>
        <td>${categoriasHtml}</td>
        <td>${escaparHtml(l.isbn)}</td>
        <td>${formatoMoneda.format(Number(l.precio))}</td>
        <td class="${claseStock}">${l.stock}</td>
        <td><span class="badge badge-${l.estatus}">${l.estatus}</span></td>
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

// ---------- Listas de casillas (autores / categorías) ----------
// Muestra las opciones activas, más las que el libro ya tenga aunque estén
// inactivas (para no quitárselas sin querer al editar).
function dibujarCasillas(idContenedor, nombreGrupo, items, seleccionados) {
  const visibles = items.filter((i) => i.activo || seleccionados.includes(i.id));

  document.getElementById(idContenedor).innerHTML = visibles.length
    ? visibles.map((i) => `
        <label class="check-item">
          <input type="checkbox" name="${nombreGrupo}" value="${i.id}" ${seleccionados.includes(i.id) ? 'checked' : ''}>
          <span>${escaparHtml(i.texto)}${i.activo ? '' : ' (inactivo)'}</span>
        </label>`).join('')
    : '<div class="empty-state">No hay opciones disponibles.</div>';
}

function idsMarcados(nombreGrupo) {
  return [...document.querySelectorAll(`input[name="${nombreGrupo}"]:checked`)]
    .map((casilla) => Number(casilla.value));
}

// ---------- Ventana emergente ----------
function abrirModal(id = null) {
  idEditando = id;
  formError.classList.remove('visible');
  formLibro.reset();

  let autoresSel = [];
  let categoriasSel = [];

  if (id === null) {
    modalTitulo.textContent = 'Nuevo libro';
  } else {
    modalTitulo.textContent = 'Editar libro';
    const l = libros.find((libro) => libro.id_libro === id);
    document.getElementById('titulo').value = l.titulo || '';
    document.getElementById('isbn').value = l.isbn || '';
    document.getElementById('precio').value = l.precio;
    document.getElementById('stock').value = l.stock;
    document.getElementById('fecha').value = l.fecha_publicacion || '';
    autoresSel = l.autoresLista.map((a) => a.id_autor);
    categoriasSel = l.categoriasLista.map((c) => c.id_categoria);
  }

  dibujarCasillas('lista-autores', 'autores',
    autores.map((a) => ({ id: a.id_autor, texto: a.nombre, activo: a.estatus === 'activo' })), autoresSel);
  dibujarCasillas('lista-categorias', 'categorias',
    categorias.map((c) => ({ id: c.id_categoria, texto: c.nombre_categoria, activo: c.estatus === 'activo' })), categoriasSel);

  modal.classList.add('visible');
  document.getElementById('titulo').focus();
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

function mostrarErrorFormulario(texto) {
  formError.textContent = texto;
  formError.classList.add('visible');
}

// ---------- Sincronizar tablas intermedias ----------
// Compara lo que el libro tenía antes contra lo que quedó marcado ahora:
// borra solo lo que se quitó e inserta solo lo que se agregó. Así, si algo
// falla a la mitad, no se pierden vínculos que no se tocaron.
async function sincronizarVinculos(tabla, columnaOtro, idLibro, idsAntes, idsAhora) {
  const agregar = idsAhora.filter((id) => !idsAntes.includes(id));
  const quitar = idsAntes.filter((id) => !idsAhora.includes(id));

  if (quitar.length > 0) {
    const { error } = await supabaseClient
      .from(tabla)
      .delete()
      .eq('id_libro', idLibro)
      .in(columnaOtro, quitar);
    if (error) return error;
  }

  if (agregar.length > 0) {
    const filas = agregar.map((id) => ({ id_libro: idLibro, [columnaOtro]: id }));
    const { error } = await supabaseClient.from(tabla).insert(filas);
    if (error) return error;
  }

  return null;
}

function mensajeDeError(error) {
  if (error.code === '23505') return 'Ya existe un libro con ese ISBN.';
  if (error.code === '23514') return 'Revisa los datos: el precio debe ser mayor a 0 y el stock no puede ser negativo.';
  if (error.code === '42501') return 'No tienes permiso para modificar el catálogo.';
  return 'No se pudo guardar: ' + error.message;
}

// ---------- Guardar ----------
formLibro.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const autoresAhora = idsMarcados('autores');
  const categoriasAhora = idsMarcados('categorias');

  const campos = {
    titulo: document.getElementById('titulo').value.trim(),
    isbn: document.getElementById('isbn').value.trim(),
    precio: Number(document.getElementById('precio').value),
    stock: parseInt(document.getElementById('stock').value, 10),
    fecha_publicacion: document.getElementById('fecha').value || null,
  };

  if (!campos.titulo || !campos.isbn) {
    mostrarErrorFormulario('El título y el ISBN son obligatorios.');
    return;
  }
  if (!(campos.precio > 0)) {
    mostrarErrorFormulario('El precio debe ser mayor a 0.');
    return;
  }
  if (!Number.isInteger(campos.stock) || campos.stock < 0) {
    mostrarErrorFormulario('El stock debe ser un número entero de 0 o más.');
    return;
  }
  // Reglas de negocio: un libro tiene al menos un autor y al menos una categoría
  if (autoresAhora.length === 0) {
    mostrarErrorFormulario('Elige al menos un autor.');
    return;
  }
  if (categoriasAhora.length === 0) {
    mostrarErrorFormulario('Elige al menos una categoría.');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  const eraNuevo = idEditando === null;
  let idLibro = idEditando;
  let autoresAntes = [];
  let categoriasAntes = [];

  if (eraNuevo) {
    const { data: nuevo, error } = await supabaseClient
      .from('libro')
      .insert(campos)
      .select()
      .single();

    if (error) {
      terminarGuardado();
      mostrarErrorFormulario(mensajeDeError(error));
      return;
    }
    idLibro = nuevo.id_libro;
  } else {
    const actual = libros.find((l) => l.id_libro === idEditando);
    autoresAntes = actual.autoresLista.map((a) => a.id_autor);
    categoriasAntes = actual.categoriasLista.map((c) => c.id_categoria);

    const { error } = await supabaseClient
      .from('libro')
      .update({ ...campos, fecha_modificacion: new Date().toISOString() })
      .eq('id_libro', idEditando);

    if (error) {
      terminarGuardado();
      mostrarErrorFormulario(mensajeDeError(error));
      return;
    }
  }

  const errorAutores = await sincronizarVinculos('libro_autor', 'id_autor', idLibro, autoresAntes, autoresAhora);
  const errorCategorias = errorAutores
    ? null
    : await sincronizarVinculos('libro_categoria', 'id_categoria', idLibro, categoriasAntes, categoriasAhora);
  const errorVinculos = errorAutores || errorCategorias;

  if (errorVinculos) {
    // Si el libro era nuevo y sus vínculos fallaron, lo deshacemos para no
    // dejar un libro "sin autor o sin categoría" que rompe las reglas.
    if (eraNuevo) {
      await supabaseClient.from('libro').delete().eq('id_libro', idLibro);
      terminarGuardado();
      mostrarErrorFormulario('No se pudo guardar el libro: ' + errorVinculos.message);
      return;
    }
    terminarGuardado();
    cerrarModal();
    mostrarMensaje('Se guardó el libro, pero falló actualizar autores o categorías.', true);
    cargarLibros();
    return;
  }

  terminarGuardado();
  cerrarModal();
  mostrarMensaje(eraNuevo ? 'Libro registrado.' : 'Libro actualizado.');
  cargarLibros();
});

function terminarGuardado() {
  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar';
}

// ---------- Activar / desactivar ----------
async function cambiarEstatus(id) {
  const l = libros.find((libro) => libro.id_libro === id);
  const nuevoEstatus = l.estatus === 'activo' ? 'inactivo' : 'activo';

  if (nuevoEstatus === 'inactivo' && !confirm(`¿Desactivar "${l.titulo}"?`)) return;

  const { error } = await supabaseClient
    .from('libro')
    .update({ estatus: nuevoEstatus, fecha_modificacion: new Date().toISOString() })
    .eq('id_libro', id);

  if (error) {
    mostrarMensaje('No se pudo cambiar el estatus.', true);
    return;
  }

  mostrarMensaje(nuevoEstatus === 'activo' ? 'Libro reactivado.' : 'Libro desactivado.');
  cargarLibros();
}

// ---------- Arranque ----------
async function iniciar() {
  await cargarLibros();
  if (esAdmin) await cargarCatalogos();
}

if (empleadoActual) iniciar();
