import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text } from 'react-native';
import { TarodanColors } from '../../src/theme';
import { useMessagesStore } from '../../src/stores/messagesStore';

export default function TabLayout() {
  const { getUnreadCount } = useMessagesStore();
  const unreadCount = getUnreadCount();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: TarodanColors.primary,
        tabBarInactiveTintColor: TarodanColors.textLight,
        tabBarStyle: {
          backgroundColor: TarodanColors.background,
          borderTopColor: TarodanColors.border,
          paddingBottom: 8,
          paddingTop: 8,
          height: 65,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana Sayfa',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Ara',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sell"
        options={{
          title: 'Satış Yap',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={TarodanColors.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mesajlar',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="chatbubbles" size={size} color={color} />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute',
                  right: -8,
                  top: -4,
                  backgroundColor: TarodanColors.error,
                  borderRadius: 10,
                  minWidth: 18,
                  height: 18,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingHorizontal: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
      {/* Hidden screens */}
      <Tabs.Screen
        name="create"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="trades"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
