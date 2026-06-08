import { Redirect } from 'expo-router';

// Eski/basit ilan ekleme formu kaldırıldı. Tek kanonik form artık `sell`
// ekranıdır (ortak <ListingForm>). Bu route'a gelen eski derin linkler
// otomatik olarak tam forma yönlendirilir.
export default function CreateRedirect() {
  return <Redirect href="/(tabs)/sell" />;
}
