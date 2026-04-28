/**
 * Initiate Trade Screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import api from '../../services/api';
import { useTradesStore } from '../../stores/tradesStore';

const InitiateTradeScreen = ({ route, navigation }: any) => {
  const { listingId } = route.params;
  const [targetListing, setTargetListing] = useState<any>(null);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [selectedListings, setSelectedListings] = useState<number[]>([]);
  const [cashAmount, setCashAmount] = useState('');
  const [cashDirection, setCashDirection] = useState<'none' | 'to_them' | 'to_me'>('none');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const { createTrade } = useTradesStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load target listing
      const listingResponse = await api.getListing(listingId);
      setTargetListing(listingResponse.listing);
      
      // Load my listings
      const myListingsResponse = await api.getListings({ my_listings: true });
      setMyListings((myListingsResponse.listings || []).filter((l: any) => l.trade_available));
      
      setIsLoading(false);
    } catch (error) {
      Alert.alert('Hata', 'Veriler yüklenemedi');
      navigation.goBack();
    }
  };

  const toggleListing = (id: number) => {
    if (selectedListings.includes(id)) {
      setSelectedListings(selectedListings.filter((lid) => lid !== id));
    } else {
      setSelectedListings([...selectedListings, id]);
    }
  };

  const handleSubmit = async () => {
    if (selectedListings.length === 0 && cashAmount === '') {
      Alert.alert('Hata', 'En az bir ürün seçin veya nakit teklifi ekleyin');
      return;
    }

    const tradeData = {
      receiver_listing_ids: [listingId],
      initiator_listing_ids: selectedListings,
      cash_amount: cashAmount ? Number(cashAmount) : 0,
      cash_direction: cashDirection === 'to_them' ? 'initiator_to_receiver' : 
                      cashDirection === 'to_me' ? 'receiver_to_initiator' : 'none',
      message: message.trim(),
    };

    try {
      await createTrade(tradeData);
      Alert.alert(
        'Başarılı', 
        'Takas teklifiniz gönderildi',
        [{ text: 'Tamam', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      Alert.alert('Hata', 'Takas teklifi gönderilemedi');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#E53935" />
      </View>
    );
  }

  const selectedValue = myListings
    .filter((l) => selectedListings.includes(l.id))
    .reduce((sum, l) => sum + l.price, 0);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Target Listing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Almak İstediğiniz</Text>
          <View style={styles.targetCard}>
            <Image
              source={{ uri: targetListing?.images?.[0] || 'https://via.placeholder.com/100' }}
              style={styles.targetImage}
            />
            <View style={styles.targetInfo}>
              <Text style={styles.targetTitle} numberOfLines={2}>{targetListing?.title}</Text>
              <Text style={styles.targetSeller}>@{targetListing?.seller?.username}</Text>
              <Text style={styles.targetPrice}>₺{targetListing?.price?.toLocaleString('tr-TR')}</Text>
            </View>
          </View>
        </View>

        {/* My Listings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Teklifiniz</Text>
          <Text style={styles.sectionHint}>Takas için ürün seçin</Text>
          
          {myListings.length === 0 ? (
            <View style={styles.emptyListings}>
              <Icon name="alert-circle-outline" size={32} color="#BDBDBD" />
              <Text style={styles.emptyText}>Takas için uygun ilanınız yok</Text>
              <TouchableOpacity 
                style={styles.createListingButton}
                onPress={() => navigation.navigate('Listings', { screen: 'CreateListing' })}
              >
                <Text style={styles.createListingText}>İlan Oluştur</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {myListings.map((listing) => (
                <TouchableOpacity
                  key={listing.id}
                  style={[
                    styles.listingCard,
                    selectedListings.includes(listing.id) && styles.listingCardSelected,
                  ]}
                  onPress={() => toggleListing(listing.id)}
                >
                  <Image
                    source={{ uri: listing.images?.[0] || 'https://via.placeholder.com/100' }}
                    style={styles.listingImage}
                  />
                  {selectedListings.includes(listing.id) && (
                    <View style={styles.checkBadge}>
                      <Icon name="checkmark" size={16} color="#FFF" />
                    </View>
                  )}
                  <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>
                  <Text style={styles.listingPrice}>₺{listing.price?.toLocaleString('tr-TR')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Cash Option */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nakit Ekle (Opsiyonel)</Text>
          
          <View style={styles.cashDirectionRow}>
            <TouchableOpacity
              style={[styles.cashDirectionButton, cashDirection === 'to_them' && styles.cashDirectionActive]}
              onPress={() => setCashDirection(cashDirection === 'to_them' ? 'none' : 'to_them')}
            >
              <Icon 
                name="arrow-forward" 
                size={20} 
                color={cashDirection === 'to_them' ? '#FFF' : '#757575'} 
              />
              <Text style={[
                styles.cashDirectionText,
                cashDirection === 'to_them' && styles.cashDirectionTextActive
              ]}>
                Ben vereceğim
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.cashDirectionButton, cashDirection === 'to_me' && styles.cashDirectionActive]}
              onPress={() => setCashDirection(cashDirection === 'to_me' ? 'none' : 'to_me')}
            >
              <Icon 
                name="arrow-back" 
                size={20} 
                color={cashDirection === 'to_me' ? '#FFF' : '#757575'} 
              />
              <Text style={[
                styles.cashDirectionText,
                cashDirection === 'to_me' && styles.cashDirectionTextActive
              ]}>
                Ben alacağım
              </Text>
            </TouchableOpacity>
          </View>

          {cashDirection !== 'none' && (
            <View style={styles.cashInputContainer}>
              <Text style={styles.cashCurrency}>₺</Text>
              <TextInput
                style={styles.cashInput}
                placeholder="0"
                placeholderTextColor="#9E9E9E"
                value={cashAmount}
                onChangeText={setCashAmount}
                keyboardType="numeric"
              />
            </View>
          )}
        </View>

        {/* Message */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mesaj (Opsiyonel)</Text>
          <TextInput
            style={styles.messageInput}
            placeholder="Satıcıya mesaj yazın..."
            placeholderTextColor="#9E9E9E"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={300}
          />
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Özet</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Seçilen ürün değeri:</Text>
            <Text style={styles.summaryValue}>₺{selectedValue.toLocaleString('tr-TR')}</Text>
          </View>
          {cashDirection !== 'none' && cashAmount && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {cashDirection === 'to_them' ? 'Nakit (+)' : 'Nakit alacağım'}:
              </Text>
              <Text style={[
                styles.summaryValue,
                { color: cashDirection === 'to_them' ? '#E53935' : '#4CAF50' }
              ]}>
                {cashDirection === 'to_them' ? '+' : ''}₺{Number(cashAmount).toLocaleString('tr-TR')}
              </Text>
            </View>
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.totalLabel}>Toplam teklif:</Text>
            <Text style={styles.totalValue}>
              ₺{(selectedValue + (cashDirection === 'to_them' ? Number(cashAmount) || 0 : 0)).toLocaleString('tr-TR')}
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.submitButton}
          onPress={handleSubmit}
        >
          <Icon name="swap-horizontal" size={22} color="#FFF" />
          <Text style={styles.submitButtonText}>Takas Teklifi Gönder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 13,
    color: '#757575',
    marginBottom: 12,
  },
  targetCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  targetImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
  },
  targetInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  targetTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#212121',
  },
  targetSeller: {
    fontSize: 13,
    color: '#757575',
    marginTop: 4,
  },
  targetPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E53935',
    marginTop: 4,
  },
  emptyListings: {
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
    marginTop: 8,
  },
  createListingButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#E53935',
    borderRadius: 20,
  },
  createListingText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  listingCard: {
    width: 140,
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  listingCardSelected: {
    borderColor: '#4CAF50',
  },
  listingImage: {
    width: '100%',
    height: 100,
    backgroundColor: '#F5F5F5',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#212121',
    padding: 8,
    paddingBottom: 0,
  },
  listingPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E53935',
    padding: 8,
    paddingTop: 4,
  },
  cashDirectionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cashDirectionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cashDirectionActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  cashDirectionText: {
    fontSize: 14,
    color: '#757575',
    marginLeft: 8,
  },
  cashDirectionTextActive: {
    color: '#FFF',
    fontWeight: '500',
  },
  cashInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    marginTop: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cashCurrency: {
    fontSize: 20,
    fontWeight: '600',
    color: '#212121',
  },
  cashInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#212121',
    paddingVertical: 16,
    marginLeft: 8,
  },
  messageInput: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#212121',
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  summaryCard: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#757575',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212121',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E53935',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 16,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default InitiateTradeScreen;


