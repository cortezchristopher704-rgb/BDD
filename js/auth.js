const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

function mostrarError(mensaje) {
  errorBox.textContent = mensaje;
  errorBox.classList.add('visible');
}

function ocultarError() {
  errorBox.classList.remove('visible');
}

form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  ocultarError();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Entrando...';

  // Paso 1: autenticar contra Supabase Auth (verifica correo y contraseña)
  const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    mostrarError('Correo o contraseña incorrectos.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Iniciar sesión';
    return;
  }

  // Paso 2: buscar ese correo en la tabla empleado, para saber su rol y si sigue activo
  const { data: empleado, error: empleadoError } = await supabaseClient
    .from('empleado')
    .select('id_empleado, nombre, cargo, rol, estatus')
    .eq('email', email)
    .single();

  if (empleadoError || !empleado) {
    mostrarError('Tu cuenta no está registrada como empleado. Contacta al administrador.');
    await supabaseClient.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Iniciar sesión';
    return;
  }

  if (empleado.estatus !== 'activo') {
    mostrarError('Tu cuenta de empleado está inactiva. Contacta al administrador.');
    await supabaseClient.auth.signOut();
    submitBtn.disabled = false;
    submitBtn.textContent = 'Iniciar sesión';
    return;
  }

  // Guardamos los datos del empleado para que las demás páginas sepan quién
  // inició sesión y qué rol tiene, sin tener que volver a consultarlo cada vez.
  sessionStorage.setItem('empleado_actual', JSON.stringify(empleado));

  window.location.href = 'dashboard.html';
});
