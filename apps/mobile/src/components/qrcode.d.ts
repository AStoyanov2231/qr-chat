declare module 'qrcode/lib/core/qrcode' {
  const QRCode: { create: typeof import('qrcode').create };
  export default QRCode;
}
