import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

// Supabase le inyecta estas 3 variables automáticamente a toda Edge Function,
// no hay que configurarlas a mano.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Encabezados CORS: le dicen al navegador "sí, una página web puede llamarme".
// Aun así, quien llame debe traer un token válido de Admin (se revisa abajo).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // La "pregunta previa" del navegador (preflight): le contestamos que sí.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return responder({ error: 'Método no permitido' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return responder({ error: 'Falta el token de sesión' }, 401)
    }

    // Cliente "como el usuario que llama" (usa su propio token de sesión),
    // nos sirve únicamente para preguntarle a Supabase Auth quién es.
    const clienteDelUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await clienteDelUsuario.auth.getUser()
    if (userError || !user || !user.email) {
      return responder({ error: 'Sesión inválida' }, 401)
    }

    // Cliente con la service_role key (permisos totales). Nunca sale de aquí,
    // nunca viaja al navegador.
    const clienteAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Verificamos, del lado del servidor, que quien llama sea de verdad
    // un Admin activo. No confiamos en nada que venga del navegador.
    const { data: quienLlama, error: quienLlamaError } = await clienteAdmin
      .from('empleado')
      .select('rol, estatus')
      .eq('email', user.email)
      .single()

    if (quienLlamaError || !quienLlama || quienLlama.rol !== 'admin' || quienLlama.estatus !== 'activo') {
      return responder({ error: 'No tienes permiso para registrar empleados' }, 403)
    }

    // Si viene id_empleado, no se crea un empleado nuevo: se le da cuenta de
    // acceso a uno que ya existe (por ejemplo, los del catálogo inicial).
    const { id_empleado, nombre, cargo, fecha_contratacion, email, password, rol } = await req.json()

    if (!email || !password || !rol || (!id_empleado && !nombre)) {
      return responder({ error: 'Faltan datos obligatorios' }, 400)
    }

    if (id_empleado) {
      const { data: existente, error: existenteError } = await clienteAdmin
        .from('empleado')
        .select('id_empleado, email')
        .eq('id_empleado', id_empleado)
        .single()

      if (existenteError || !existente) {
        return responder({ error: 'Ese empleado no existe' }, 404)
      }
      if (existente.email) {
        return responder({ error: 'Ese empleado ya tiene cuenta de acceso' }, 400)
      }
    }

    // Paso 1: crear la cuenta de acceso en Supabase Auth.
    // email_confirm: true la deja activa de inmediato, sin esperar correo.
    const { data: nuevoUsuario, error: crearUsuarioError } = await clienteAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (crearUsuarioError) {
      return responder({ error: crearUsuarioError.message }, 400)
    }

    // Paso 2: crear su fila en la tabla empleado, o (si venía id_empleado)
    // ligar la cuenta nueva a la fila que ya existía.
    let nuevoEmpleado, crearEmpleadoError
    if (id_empleado) {
      ({ data: nuevoEmpleado, error: crearEmpleadoError } = await clienteAdmin
        .from('empleado')
        .update({ email, rol, fecha_modificacion: new Date().toISOString() })
        .eq('id_empleado', id_empleado)
        .select()
        .single())
    } else {
      ({ data: nuevoEmpleado, error: crearEmpleadoError } = await clienteAdmin
        .from('empleado')
        .insert({ nombre, cargo, fecha_contratacion, email, rol })
        .select()
        .single())
    }

    if (crearEmpleadoError) {
      // Si esto falla, deshacemos la cuenta de Auth para no dejar un
      // usuario "fantasma" sin fila de empleado asociada.
      await clienteAdmin.auth.admin.deleteUser(nuevoUsuario.user.id)
      return responder({ error: crearEmpleadoError.message }, 400)
    }

    return responder({ empleado: nuevoEmpleado }, 200)

  } catch (err) {
    return responder({ error: 'Error inesperado' }, 500)
  }
})
