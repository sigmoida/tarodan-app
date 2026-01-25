/**
 * Create Listing Screen - Expo Compatible
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Camera from 'expo-camera';
import { endpoints } from '../../services/api';

// Product condition values matching backend enum
const CONDITIONS = [
  { value: 'mint', label: 'Mükemmel (Mint)' },
  { value: 'near_mint', label: 'Çok İyi (Near Mint)' },
  { value: 'very_good', label: 'İyi (Very Good)' },
  { value: 'good', label: 'Orta (Good)' },
  { value: 'fair', label: 'Kullanılmış (Fair)' },
];

interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

const CreateListingScreen = ({ navigation }: any) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tradeAvailable, setTradeAvailable] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Categories from API
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  
  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);
  
  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const response = await endpoints.categories.getAll();
      // Flatten categories for easier selection (include children)
      const flatCategories: Category[] = [];
      const addCategory = (cat: Category, prefix = '') => {
        flatCategories.push({
          ...cat,
          name: prefix ? `${prefix} > ${cat.name}` : cat.name,
        });
        if (cat.children) {
          cat.children.forEach(child => addCategory(child, cat.name));
        }
      };
      (response.data || response).forEach((cat: Category) => addCategory(cat));
      setCategories(flatCategories);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      Alert.alert('Hata', 'Kategoriler yüklenemedi');
    } finally {
      setCategoriesLoading(false);
    }
  };

  const requestPermissions = async () => {
    const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
    const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
      Alert.alert(
        'İzin Gerekli',
        'Fotoğraf eklemek için kamera ve galeri izni gerekli.',
        [{ text: 'Tamam' }]
      );
      return false;
    }
    return true;
  };

  const showImageOptions = () => {
    Alert.alert(
      'Fotoğraf Ekle',
      'Nasıl eklemek istersiniz?',
      [
        { text: 'Kamera', onPress: takePhoto },
        { text: 'Galeri', onPress: pickFromGallery },
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  const takePhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImages([...images, result.assets[0].uri]);
    }
  };

  const pickFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - images.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      const newImages = result.assets.map(asset => asset.uri);
      setImages([...images, ...newImages].slice(0, 5));
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    // Validation
    if (!title.trim()) {
      Alert.alert('Hata', 'Başlık gerekli');
      return;
    }
    if (title.trim().length < 5) {
      Alert.alert('Hata', 'Başlık en az 5 karakter olmalıdır');
      return;
    }
    if (!price.trim() || isNaN(Number(price))) {
      Alert.alert('Hata', 'Geçerli bir fiyat girin');
      return;
    }
    if (Number(price) < 1) {
      Alert.alert('Hata', 'Fiyat en az 1 TL olmalıdır');
      return;
    }
    if (!categoryId) {
      Alert.alert('Hata', 'Kategori seçin');
      return;
    }
    if (!condition) {
      Alert.alert('Hata', 'Durum seçin');
      return;
    }
    if (images.length === 0) {
      Alert.alert('Hata', 'En az bir fotoğraf ekleyin');
      return;
    }

    setIsLoading(true);

    try {
      // First upload images, then create product with image URLs
      const imageUrls: string[] = [];
      
      for (const uri of images) {
        const formData = new FormData();
        const filename = uri.split('/').pop() || `image_${Date.now()}.jpg`;
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('file', {
          uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
          type,
          name: filename,
        } as any);
        
        try {
          const uploadResponse = await endpoints.upload.image(formData);
          if (uploadResponse.url) {
            imageUrls.push(uploadResponse.url);
          }
        } catch (uploadError) {
          console.error('Image upload error:', uploadError);
          // Continue with other images
        }
      }
      
      if (imageUrls.length === 0) {
        Alert.alert('Hata', 'Fotoğraflar yüklenemedi. Lütfen tekrar deneyin.');
        setIsLoading(false);
        return;
      }

      // Create product with JSON body (not FormData)
      const productData = {
        title: title.trim(),
        description: description.trim() || undefined,
        price: Number(price),
        categoryId,
        condition,
        isTradeEnabled: tradeAvailable,
        imageUrls,
      };

      await endpoints.products.create(productData);
      
      Alert.alert('Başarılı', 'İlan oluşturuldu ve onaya gönderildi', [
        { text: 'Tamam', onPress: () => navigation.goBack() }
      ]);
    } catch (error: any) {
      console.error('Create listing error:', error);
      Alert.alert('Hata', error.response?.data?.message || 'İlan oluşturulamadı');
    } finally {
      setIsLoading(false);
    }
  };

  // Generic select field for string options
  const SelectField = ({ 
    label, 
    value, 
    options, 
    onChange,
    required = false,
  }: { 
    label: string; 
    value: string; 
    options: { value: string; label: string }[]; 
    onChange: (v: string) => void;
    required?: boolean;
  }) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? ' *' : ''}</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.optionsContainer}
      >
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.optionChip, value === option.value && styles.optionChipActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[
              styles.optionChipText, 
              value === option.value && styles.optionChipTextActive
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
  
  // Category select field
  const CategorySelectField = () => (
    <View style={styles.field}>
      <Text style={styles.label}>Kategori *</Text>
      {categoriesLoading ? (
        <ActivityIndicator size="small" color="#e94560" />
      ) : (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.optionsContainer}
        >
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.optionChip, categoryId === cat.id && styles.optionChipActive]}
              onPress={() => setCategoryId(cat.id)}
            >
              <Text style={[
                styles.optionChipText, 
                categoryId === cat.id && styles.optionChipTextActive
              ]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Images */}
      <View style={styles.field}>
        <Text style={styles.label}>Fotoğraflar *</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.imagesContainer}
        >
          {images.map((uri, index) => (
            <View key={index} style={styles.imageWrapper}>
              <Image source={{ uri }} style={styles.image} />
              <TouchableOpacity 
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
              >
                <Ionicons name="close" size={16} color="#FFF" />
              </TouchableOpacity>
              {index === 0 && (
                <View style={styles.mainBadge}>
                  <Text style={styles.mainBadgeText}>Ana</Text>
                </View>
              )}
            </View>
          ))}
          {images.length < 5 && (
            <TouchableOpacity style={styles.addImageButton} onPress={showImageOptions}>
              <Ionicons name="camera" size={32} color="#BDBDBD" />
              <Text style={styles.addImageText}>Ekle</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        <Text style={styles.hint}>{images.length}/5 fotoğraf • İlk fotoğraf ana görsel olacak</Text>
      </View>

      {/* Title */}
      <View style={styles.field}>
        <Text style={styles.label}>Başlık *</Text>
        <TextInput
          style={styles.input}
          placeholder="Örn: Hot Wheels '69 Camaro Z28"
          placeholderTextColor="#9E9E9E"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
      </View>

      {/* Description */}
      <View style={styles.field}>
        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Ürün hakkında detaylı bilgi..."
          placeholderTextColor="#9E9E9E"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          maxLength={500}
        />
        <Text style={styles.hint}>{description.length}/500</Text>
      </View>

      {/* Price */}
      <View style={styles.field}>
        <Text style={styles.label}>Fiyat (₺) *</Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor="#9E9E9E"
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
        />
      </View>

      {/* Category - from API */}
      <CategorySelectField />

      {/* Condition */}
      <SelectField 
        label="Durum" 
        value={condition} 
        options={CONDITIONS} 
        onChange={setCondition}
        required
      />

      {/* Trade Available */}
      <View style={styles.switchField}>
        <View style={styles.switchContent}>
          <Ionicons name="swap-horizontal" size={24} color="#4CAF50" />
          <View style={styles.switchTextContainer}>
            <Text style={styles.switchLabel}>Takas Kabul</Text>
            <Text style={styles.switchHint}>Bu ürün için takas tekliflerine açık mısınız?</Text>
          </View>
        </View>
        <Switch
          value={tradeAvailable}
          onValueChange={setTradeAvailable}
          trackColor={{ false: '#E0E0E0', true: '#81C784' }}
          thumbColor={tradeAvailable ? '#4CAF50' : '#FAFAFA'}
        />
      </View>

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#1976D2" />
        <Text style={styles.infoText}>
          İlanınız onay sürecinden geçtikten sonra yayınlanacaktır. 
          Bu süreç genellikle 24 saat içinde tamamlanır.
        </Text>
      </View>

      {/* Submit Button */}
      <TouchableOpacity 
        style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={24} color="#FFF" />
            <Text style={styles.submitButtonText}>İlanı Yayınla</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#16213e',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#3c3d4f',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  imagesContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  imageWrapper: {
    position: 'relative',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#16213e',
  },
  removeImageButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e94560',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#e94560',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#3c3d4f',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#16213e',
  },
  addImageText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#3c3d4f',
  },
  optionChipActive: {
    backgroundColor: '#e94560',
    borderColor: '#e94560',
  },
  optionChipText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  optionChipTextActive: {
    color: '#FFF',
    fontWeight: '500',
  },
  switchField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#16213e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#3c3d4f',
  },
  switchContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  switchTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  switchHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(25, 118, 210, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  infoText: {
    color: '#64b5f6',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#e94560',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default CreateListingScreen;
