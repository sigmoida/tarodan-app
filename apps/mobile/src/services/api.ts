// Thin barrel: gerçek implementasyon `src/lib/api/` altında domain modüllerine
// bölündü. Bu dosya geriye dönük uyumluluk için her şeyi yeniden dışa aktarır;
// mevcut ~140 importer değişmeden çalışmaya devam eder.
export * from '../lib/api';
export { default } from '../lib/api';
