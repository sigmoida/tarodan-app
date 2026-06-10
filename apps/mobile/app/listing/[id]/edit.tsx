import { useLocalSearchParams } from 'expo-router';
import ListingForm from '../../../src/components/listing/ListingForm';

// İlan düzenleme ekranı. Form mantığı ortak <ListingForm> bileşeninde (create ile aynı).
export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const productId = Array.isArray(id) ? id[0] : id;
  return <ListingForm mode="edit" productId={productId} />;
}
