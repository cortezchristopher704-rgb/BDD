// Esta página es solo para Admin. Si un Empleado llega escribiendo la URL,
// lo regresamos al inicio. (La protección de verdad la da RLS en la base;
// esto es para que no vea una pantalla vacía o rota.)
if (!esAdmin) {
  window.location.href = 'dashboard.html';
}

let empleados = [];
let idEditando = null;
let idDandoAcceso = null;   // con número = estamos creándole cuenta a un empleado que ya existe

const tbody = document.getElementById('tabla-body');
const buscador = document.getElementById('buscador');
const filtroEstatus = document.getElementById('filtro-estatus');
const modal = document.getElementById('modal');
const formEmpleado = document.getElementById('form-empleado');
const modalTitulo = document.getElementById('modal-titulo');
const formError = document.getElementById('form-error');
const btnGuardar = document.getElementById('btn-guardar');
const toast = document.getElementById('toast');

const grupoPassword = document.getElementById('grupo-password');
const campoEmail = document.getElementById('email');
const campoPassword = document.getElementById('password');
const campoRol = document.getElementById('rol');
const notaEmail = document.getElementById('nota-email');
const notaRol = document.getElementById('nota-rol');

let temporizadorToast;
function mostrarMensaje(texto, esError = false) {
  toast.textContent = texto;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => toast.classList.remove('visible'), 4000);
}

function formatoFecha(texto) {
  return texto ? texto.split('-').reverse().join('/') : '—';
}

function esMiRegistro(empleado) {
  return empleadoActual && empleado.id_empleado === empleadoActual.id_empleado;
}

// ---------- Leer empleados ----------
async function cargarEmpleados() {
  const { data, error } = await supabaseClient
    .from('empleado')
    .select('*')
    .order('id_empleado', { ascending: true });

  if (error) {
    mostrarMensaje('No se pudieron cargar los empleados.', true);
    return;
  }

  empleados = data;
  renderizar();
}

// ---------- Dibujar la tabla ----------
function renderizar() {
  const texto = buscador.value.trim().toLowerCase();
  const estatus = filtroEstatus.value;

  const filtrados = empleados.filter((e) => {
    const coincideTexto = [e.nombre, e.cargo, e.email]
      .some((valor) => (valor || '').toLowerCase().includes(texto));
    const coincideEstatus = estatus === 'todos' || e.estatus === estatus;
    return coincideTexto && coincideEstatus;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay empleados que coincidan.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map((e) => {
    const soyYo = esMiRegistro(e);

    // Si todavía no tiene cuenta de acceso, se le puede dar una
    const botonAcceso = e.email ? '' : `
      <button class="link-btn" data-accion="acceso" data-id="${e.id_empleado}">Dar acceso</button>`;

    // Un Admin no puede desactivarse a sí mismo (se quedaría sin acceso)
    const botonEstatus = soyYo ? '' : `
      <button class="link-btn" data-accion="estatus" data-id="${e.id_empleado}">
        ${e.estatus === 'activo' ? 'Desactivar' : 'Reactivar'}
      </button>`;

    return `
      <tr>
        <td>${escaparHtml(e.nombre)}${soyYo ? ' <span class="chip">tú</span>' : ''}</td>
        <td>${escaparHtml(e.cargo) || '—'}</td>
        <td>${e.email ? escaparHtml(e.email) : '<span class="muted">Sin cuenta de acceso</span>'}</td>
        <td><span class="badge badge-rol-${e.rol}">${e.rol === 'admin' ? 'Admin' : 'Empleado'}</span></td>
        <td>${formatoFecha(e.fecha_contratacion)}</td>
        <td><span class="badge badge-${e.estatus}">${e.estatus}</span></td>
        <td class="acciones">
          ${botonAcceso}
          <button class="link-btn" data-accion="editar" data-id="${e.id_empleado}">Editar</button>
          ${botonEstatus}
        </td>
      </tr>`;
  }).join('');
}

tbody.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  if (boton.dataset.accion === 'editar') abrirModal(id);
  if (boton.dataset.accion === 'acceso') abrirModalAcceso(id);
  if (boton.dataset.accion === 'estatus') cambiarEstatus(id);
});

buscador.addEventListener('input', renderizar);
filtroEstatus.addEventListener('change', renderizar);

// ---------- Ventana emergente ----------
function abrirModal(id = null) {
  idEditando = id;
  idDandoAcceso = null;
  formError.classList.remove('visible');
  formEmpleado.reset();

  // Por si venimos de "Dar acceso", que bloquea estos campos
  ['nombre', 'cargo', 'fecha'].forEach((campo) => {
    document.getElementById(campo).disabled = false;
  });

  const creando = id === null;

  // Contraseña: solo se pide al crear la cuenta
  grupoPassword.style.display = creando ? '' : 'none';
  campoPassword.required = creando;

  // Correo: solo se puede escribir al crear (después está ligado a su cuenta)
  campoEmail.disabled = !creando;
  campoEmail.required = creando;
  notaEmail.textContent = creando
    ? 'Con este correo iniciará sesión.'
    : 'El correo no se puede cambiar porque está ligado a su cuenta de acceso.';

  campoRol.disabled = false;
  notaRol.textContent = '';

  if (creando) {
    modalTitulo.textContent = 'Nuevo empleado';
    campoRol.value = 'empleado';
  } else {
    modalTitulo.textContent = 'Editar empleado';
    const e = empleados.find((empleado) => empleado.id_empleado === id);
    document.getElementById('nombre').value = e.nombre || '';
    document.getElementById('cargo').value = e.cargo || '';
    document.getElementById('fecha').value = e.fecha_contratacion || '';
    campoEmail.value = e.email || '';
    campoRol.value = e.rol;

    // Un Admin no puede quitarse su propio rol (se quedaría sin acceso)
    if (esMiRegistro(e)) {
      campoRol.disabled = true;
      notaRol.textContent = 'No puedes cambiar tu propio rol.';
    }
  }

  modal.classList.add('visible');
  document.getElementById('nombre').focus();
}

function cerrarModal() {
  modal.classList.remove('visible');
}

// "Dar acceso": el empleado ya existe, solo falta crearle su cuenta de login.
function abrirModalAcceso(id) {
  abrirModal(id); // llena nombre, cargo, fecha y rol con lo que ya tiene
  idDandoAcceso = id;

  const e = empleados.find((empleado) => empleado.id_empleado === id);
  modalTitulo.textContent = 'Dar acceso a ' + e.nombre;

  // Sus datos ya existen, así que quedan bloqueados
  ['nombre', 'cargo', 'fecha'].forEach((campo) => {
    document.getElementById(campo).disabled = true;
  });

  // Lo que sí hay que capturar: correo, contraseña temporal y rol
  grupoPassword.style.display = '';
  campoPassword.required = true;
  campoEmail.disabled = false;
  campoEmail.required = true;
  campoEmail.value = '';
  notaEmail.textContent = 'Con este correo iniciará sesión.';
  campoEmail.focus();
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

function mostrarErrorFormulario(texto) {
  formError.textContent = texto;
  formError.classList.add('visible');
}

// Cuando la Edge Function responde con error, el mensaje viene dentro de la
// respuesta (error.context). Aquí lo sacamos y lo traducimos si hace falta.
async function mensajeDeFuncion(error) {
  let mensaje = 'No se pudo registrar al empleado.';
  try {
    if (error.context && typeof error.context.json === 'function') {
      const detalle = await error.context.json();
      if (detalle && detalle.error) mensaje = detalle.error;
    }
  } catch (_) {
    // si no se puede leer, nos quedamos con el mensaje genérico
  }

  if (/already (been )?registered|duplicate key/i.test(mensaje)) {
    return 'Ya existe una cuenta con ese correo.';
  }
  return mensaje;
}

// ---------- Guardar ----------
formEmpleado.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  formError.classList.remove('visible');

  const nombre = document.getElementById('nombre').value.trim();
  if (!nombre) {
    mostrarErrorFormulario('El nombre es obligatorio.');
    return;
  }

  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando...';

  // Dar acceso a un empleado que ya existía: la función crea la cuenta de
  // login y la liga a su ficha, sin crear un empleado duplicado.
  if (idDandoAcceso !== null) {
    const { error } = await supabaseClient.functions.invoke('crear-empleado', {
      body: {
        id_empleado: idDandoAcceso,
        email: campoEmail.value.trim(),
        password: campoPassword.value,
        rol: campoRol.value,
      },
    });

    terminarGuardado();

    if (error) {
      mostrarErrorFormulario(await mensajeDeFuncion(error));
      return;
    }

    cerrarModal();
    mostrarMensaje('Cuenta creada. Entrégale su correo y su contraseña temporal.');
    cargarEmpleados();
    return;
  }

  const creando = idEditando === null;

  if (creando) {
    // Crear cuenta + fila de empleado: lo hace la Edge Function (con permisos
    // que el navegador no tiene), después de verificar que seas Admin.
    const { error } = await supabaseClient.functions.invoke('crear-empleado', {
      body: {
        nombre,
        cargo: valorOpcional('cargo'),
        fecha_contratacion: valorOpcional('fecha'),
        email: campoEmail.value.trim(),
        password: campoPassword.value,
        rol: campoRol.value,
      },
    });

    terminarGuardado();

    if (error) {
      mostrarErrorFormulario(await mensajeDeFuncion(error));
      return;
    }

    cerrarModal();
    mostrarMensaje('Empleado registrado. Entrégale su correo y su contraseña temporal.');
    cargarEmpleados();
    return;
  }

  // Editar: solo cambian datos de la fila (el correo y la cuenta no se tocan)
  const actual = empleados.find((e) => e.id_empleado === idEditando);
  const campos = {
    nombre,
    cargo: valorOpcional('cargo'),
    fecha_contratacion: valorOpcional('fecha'),
    fecha_modificacion: new Date().toISOString(),
  };
  if (!esMiRegistro(actual)) campos.rol = campoRol.value;

  const { error } = await supabaseClient
    .from('empleado')
    .update(campos)
    .eq('id_empleado', idEditando);

  terminarGuardado();

  if (error) {
    mostrarErrorFormulario(
      error.code === '42501' ? 'No tienes permiso para modificar empleados.' : 'No se pudo guardar: ' + error.message
    );
    return;
  }

  cerrarModal();
  mostrarMensaje('Empleado actualizado.');
  cargarEmpleados();
});

function terminarGuardado() {
  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar';
}

// ---------- Activar / desactivar ----------
async function cambiarEstatus(id) {
  const e = empleados.find((empleado) => empleado.id_empleado === id);
  if (esMiRegistro(e)) return;

  const nuevoEstatus = e.estatus === 'activo' ? 'inactivo' : 'activo';

  if (nuevoEstatus === 'inactivo' &&
      !confirm(`¿Desactivar a ${e.nombre}? Ya no podrá usar el sistema.`)) return;

  const { error } = await supabaseClient
    .from('empleado')
    .update({ estatus: nuevoEstatus, fecha_modificacion: new Date().toISOString() })
    .eq('id_empleado', id);

  if (error) {
    mostrarMensaje('No se pudo cambiar el estatus.', true);
    return;
  }

  mostrarMensaje(nuevoEstatus === 'activo' ? 'Empleado reactivado.' : 'Empleado desactivado.');
  cargarEmpleados();
}

// ---------- Arranque ----------
if (esAdmin) cargarEmpleados();
