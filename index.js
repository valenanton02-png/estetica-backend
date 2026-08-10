require('dotenv').config();
const express = require('express');
const cors = require('cors');

// 1. Importamos el adaptador oficial y las herramientas de PostgreSQL
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const app = express();

// 2. Construimos el "puente" usando la URL secreta de tu archivo .env
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// 3. Le entregamos el adaptador a Prisma para que pueda conectarse
const prisma = new PrismaClient({ adapter });

app.use(cors());
app.use(express.json());

// Ruta de prueba original
app.get('/', (req, res) => {
  res.send('¡El servidor de la estética está funcionando perfecto!');
});

// --- RUTAS DE SERVICIOS (CATÁLOGO) ---
app.get('/servicios', async (req, res) => {
  try {
    const listaDeServicios = await prisma.servicio.findMany();
    res.json(listaDeServicios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error al buscar los servicios" });
  }
});

app.post('/servicios', async (req, res) => {
  try {
    console.log("📥 Datos recibidos del formulario:", req.body);
    const { nombre, precio, descripcion, duracion } = req.body;
    
    const precioFirme = parseFloat(precio) || 0;
    const duracionFirme = parseInt(duracion) || 45;

    const nuevoServicio = await prisma.servicio.create({
      data: {
        nombre: nombre,
        precio: precioFirme,
        duracionMin: duracionFirme,
        descripcion: descripcion
      }
    });
    
    console.log("✅ ¡Guardado exitoso!");
    res.json(nuevoServicio);
  } catch (error) {
    console.error("❌ ====== ERROR EXACTO ======");
    console.error(error.message); 
    res.status(500).json({ error: "Fallo al crear el servicio" });
  }
});

app.delete('/servicios/:id', async (req, res) => {
  try {
    const idServicio = parseInt(req.params.id);
    await prisma.servicio.delete({
      where: { id: idServicio }
    });
    res.json({ mensaje: "Servicio eliminado correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fallo al eliminar" });
  }
});

// --- RUTAS DE TASA BCV ---
app.get('/tasa-bcv', async (req, res) => {
  try {
    const respuesta = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (!respuesta.ok) throw new Error('Error en la nueva API');
    const datos = await respuesta.json();
    res.json(datos);
  } catch (error) {
    console.error("Fallo la API principal. Activando respaldo.");
    res.json({ promedio: 36.50 }); 
  }
});

// --- RUTAS DE CLIENTES ---
app.post('/clientes', async (req, res) => {
  try {
    const { nombre, telefono, cedula, edad, alergias, condiciones, notas } = req.body;
    const nuevoCliente = await prisma.cliente.create({
      data: {
        nombre: nombre,
        telefono: telefono,
        cedula: cedula,
        edad: edad ? parseInt(edad) : null,
        alergias: alergias,
        condiciones: condiciones,
        notas: notas
      }
    });
    res.json(nuevoCliente);
  } catch (error) {
    console.error("Error detallado:", error);
    res.status(500).json({ mensaje: "Error al crear la clienta" });
  }
});

app.get('/clientes/:id', async (req, res) => {
  try {
    const idPaciente = parseInt(req.params.id);
    const expediente = await prisma.cliente.findUnique({
      where: { id: idPaciente }
    });
    if (expediente) {
      res.json(expediente);
    } else {
      res.status(404).json({ error: "Paciente no encontrada" });
    }
  } catch (error) {
    console.error("Error al buscar el expediente:", error);
    res.status(500).json({ error: "Fallo al obtener la ficha" });
  }
});

app.get('/clientes', async (req, res) => {
  try {
    const todasLasClientas = await prisma.cliente.findMany();
    res.json(todasLasClientas);
  } catch (error) {
    console.error("Error al buscar clientas:", error);
    res.status(500).json({ error: "Fallo al obtener clientas" });
  }
});
// ELIMINAR a una clienta (Y limpiar su historial de citas)
app.delete('/clientes/:id', async (req, res) => {
  try {
    const idCliente = parseInt(req.params.id);
    
    // 1. Primero borramos todo su historial de citas para no dejar datos huérfanos
    await prisma.cita.deleteMany({
      where: { clienteId: idCliente }
    });

    // 2. Ahora sí, eliminamos el expediente de la paciente
    await prisma.cliente.delete({
      where: { id: idCliente }
    });

    res.json({ mensaje: "Paciente y su historial eliminados correctamente" });
  } catch (error) {
    console.error("Error al eliminar paciente:", error);
    res.status(500).json({ error: "Fallo al eliminar el registro" });
  }
});
// OBTENER el historial de citas de una clienta específica
app.get('/clientes/:id/citas', async (req, res) => {
  try {
    const idCliente = parseInt(req.params.id);
    const citas = await prisma.cita.findMany({
      where: { clienteId: idCliente },
      include: { servicio: true },
      orderBy: { fecha: 'desc' } // Las más recientes arriba
    });
    res.json(citas);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener el historial de citas" });
  }
});
// --- RUTAS DE CITAS ---

// AGENDAR una nueva cita (Actualizado con Paquetes)
app.post('/citas', async (req, res) => {
  try {
    const { fecha, hora, tipo, clienteId, servicioId, sesionActual, totalSesiones, extras } = req.body;
    
    const nuevaCita = await prisma.cita.create({
      data: {
        fecha: fecha,
        hora: hora,
        tipo: tipo || "unica",
        clienteId: parseInt(clienteId),
        servicioId: parseInt(servicioId),
        sesionActual: sesionActual ? parseInt(sesionActual) : null,
        totalSesiones: totalSesiones ? parseInt(totalSesiones) : null,
        extras: extras || null
      }
    });
    
    res.json(nuevaCita);
  } catch (error) {
    console.error("Error al agendar la cita:", error);
    res.status(500).json({ error: "Fallo al guardar la cita en el sistema" });
  }
});

// OBTENER todas las citas con los datos cruzados
app.get('/citas', async (req, res) => {
  try {
    const todasLasCitas = await prisma.cita.findMany({
      include: {
        cliente: true,   // Trae los datos de la paciente
        servicio: true   // Trae los datos del tratamiento
      },
      orderBy: { hora: 'asc' } // Ordena las citas por hora
    });
    res.json(todasLasCitas);
  } catch (error) {
    console.error("Error al buscar citas:", error);
    res.status(500).json({ error: "Fallo al obtener las citas" });
  }
});

// ACTUALIZAR ESTADO Y PROCESAR ABONOS/DEUDAS
app.put('/citas/:id/estado', async (req, res) => {
  try {
    const idCita = parseInt(req.params.id);
    const { estado, metodoPago, montoPagado, cargoSesion } = req.body;
    
    // Si la cita se está completando y cobrando
    if (estado === 'Completada') {
      // 1. Buscamos la cita y al cliente para saber su deuda anterior
      const cita = await prisma.cita.findUnique({ where: { id: idCita }, include: { cliente: true } });
      
      const cargo = parseFloat(cargoSesion) || 0;
      const abono = parseFloat(montoPagado) || 0;
      
      // 2. Calculamos la nueva deuda: Lo que debía + El cargo de hoy - Lo que abonó hoy
      const nuevaDeuda = cita.cliente.deuda + cargo - abono;

      // 3. Actualizamos la deuda en el perfil del cliente
      await prisma.cliente.update({
        where: { id: cita.clienteId },
        data: { deuda: nuevaDeuda }
      });

      // 4. Guardamos el pago en el registro de la cita
      const citaActualizada = await prisma.cita.update({
        where: { id: idCita },
        data: { estado: estado, metodoPago: metodoPago, montoPagado: abono }
      });
      
      res.json(citaActualizada);
    } else {
      // Si solo se está cancelando, no tocamos el dinero
      const citaCancelada = await prisma.cita.update({
        where: { id: idCita },
        data: { estado: estado }
      });
      res.json(citaCancelada);
    }
  } catch (error) {
    console.error("Error al procesar el cobro:", error);
    res.status(500).json({ error: "Fallo al procesar el pago" });
  }
});

// --- SISTEMA DE LOGIN Y SEGURIDAD ---

// 1. Crear un usuario administrador por defecto si no existe
async function crearAdminPorDefecto() {
  try {
    const adminExiste = await prisma.usuario.findUnique({
      where: { usuario: "admin" }
    });

    if (!adminExiste) {
      await prisma.usuario.create({
        data: {
          nombre: "Alma y Cuerpo",
          usuario: "admin",
          password: "admin123", // Contraseña inicial por defecto
          rol: "admin"
        }
      });
      console.log("🔐 Usuario administrador creado (Usuario: admin | Clave: admin123)");
    } else {
      console.log("✅ El usuario administrador ya está listo en la base de datos.");
    }
  } catch (error) {
    console.log("Aviso: Verificación de seguridad de usuarios completada.");
  }
}
crearAdminPorDefecto(); // Ejecutamos la función al arrancar el servidor

// 2. Ruta para verificar las credenciales y dejar entrar al usuario
app.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { usuario: usuario }
    });

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const tokenBasico = "TICKET_ALMA_Y_CUERPO_" + user.id;

    res.json({
      token: tokenBasico,
      nombre: user.nombre,
      rol: user.rol
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor al intentar acceder" });
  }
});
// ACTUALIZAR un servicio (Catálogo)
app.put('/servicios/:id', async (req, res) => {
  try {
    const idServicio = parseInt(req.params.id);
    const { nombre, precio, duracion, descripcion } = req.body;
    const servicioActualizado = await prisma.servicio.update({
      where: { id: idServicio },
      data: { nombre, precio: parseFloat(precio) || 0, duracionMin: parseInt(duracion) || 45, descripcion }
    });
    res.json(servicioActualizado);
  } catch (error) {
    res.status(500).json({ error: "Fallo al actualizar el servicio" });
  }
});

// ACTUALIZAR una clienta
app.put('/clientes/:id', async (req, res) => {
  try {
    const idCliente = parseInt(req.params.id);
    const { nombre, telefono, cedula, edad, alergias, condiciones, notas } = req.body;
    const clienteActualizado = await prisma.cliente.update({
      where: { id: idCliente },
      data: { nombre, telefono, cedula, edad: edad ? parseInt(edad) : null, alergias, condiciones, notas }
    });
    res.json(clienteActualizado);
  } catch (error) {
    res.status(500).json({ error: "Fallo al actualizar la clienta" });
  }
});
// --- RUTAS DE GESTIÓN DE USUARIOS ---

// OBTENER todos los usuarios (ocultando las contraseñas por seguridad)
app.get('/usuarios', async (req, res) => {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, nombre: true, usuario: true, rol: true } 
    });
    res.json(usuarios);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Fallo al obtener usuarios" });
  }
});

// CREAR un nuevo usuario
app.post('/usuarios', async (req, res) => {
  try {
    const { nombre, usuario, password, rol } = req.body;
    const nuevoUsuario = await prisma.usuario.create({
      data: { nombre, usuario, password, rol }
    });
    res.json({ mensaje: "Usuario creado con éxito" });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: "Este nombre de usuario ya existe." });
    }
    res.status(500).json({ error: "Fallo al crear usuario" });
  }
});

// ELIMINAR un usuario
app.delete('/usuarios/:id', async (req, res) => {
  try {
    const idUsuario = parseInt(req.params.id);
    await prisma.usuario.delete({ where: { id: idUsuario } });
    res.json({ mensaje: "Usuario eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Fallo al eliminar" });
  }
});

// ENCENDER SERVIDOR
const PUERTO = 3000;
app.listen(PUERTO, () => {
  console.log(`Servidor corriendo en el puerto ${PUERTO}`);
});