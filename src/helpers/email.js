/**
 * Helper para envio de emails con Gmail App Password
 * Utiliza nodemailer con transporte SMTP de Gmail
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

/**
 * Envia un email de verificacion de cuenta
 * @param {string} to - Email del destinatario
 * @param {string} name - Nombre del usuario
 * @param {string} verifyToken - Token de verificacion
 * @param {string} baseUrl - URL base de la aplicacion
 */
async function sendVerificationEmail(to, name, verifyToken, baseUrl) {
  const verifyUrl = `${baseUrl}/verify-email?token=${verifyToken}`;

  await transporter.sendMail({
    from: `"Spider-Web ARG Pasantias" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Verifica tu cuenta — Spider-Web ARG',
    html: `
      <div style="font-family: 'Courier New', monospace; background: #000; color: #F5F5F5; padding: 40px; max-width: 600px; margin: 0 auto; border: 1px solid rgba(163,0,0,0.3);">
        <div style="border-bottom: 1px solid rgba(163,0,0,0.3); padding-bottom: 20px; margin-bottom: 30px;">
          <span style="font-size: 0.7rem; letter-spacing: 0.2em; color: #A30000; text-transform: uppercase;">Spider-Web ARG — Sistema de Pasantias</span>
          <h1 style="font-size: 1.8rem; margin: 10px 0 0; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em;">Verifica tu cuenta</h1>
        </div>
        <p style="color: rgba(245,245,245,0.7); margin-bottom: 24px;">Hola <strong>${name}</strong>,</p>
        <p style="color: rgba(245,245,245,0.7); margin-bottom: 32px;">Para activar tu cuenta en el sistema de pasantias, haz clic en el siguiente enlace:</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #A30000; color: #F5F5F5; padding: 14px 28px; text-decoration: none; font-size: 0.8rem; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 700;">VERIFICAR CUENTA</a>
        <p style="color: rgba(245,245,245,0.35); margin-top: 40px; font-size: 0.7rem; letter-spacing: 0.05em;">Si no solicitaste este registro, ignora este correo. El enlace expira en 24 horas.</p>
        <p style="color: rgba(245,245,245,0.2); font-size: 0.65rem; margin-top: 20px; letter-spacing: 0.1em;">SPIDER-WEB ARG — SISTEMA INTERNO</p>
      </div>
    `,
  });
}

/**
 * Envia un email de notificacion generica
 */
async function sendNotificationEmail(to, subject, htmlContent) {
  await transporter.sendMail({
    from: `"Spider-Web ARG Pasantias" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html: htmlContent,
  });
}

module.exports = { sendVerificationEmail, sendNotificationEmail };
