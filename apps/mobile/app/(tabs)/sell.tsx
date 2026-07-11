import ListingForm from '@/components/listing/ListingForm';

// Yeni ilan oluşturma ekranı. Form mantığı ortak <ListingForm> bileşeninde;
// create + edit aynı kaynağı kullanır (web paritesi).
export default function SellScreen() {
  return <ListingForm mode="create" />;
}
