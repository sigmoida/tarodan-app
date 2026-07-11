import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text, Input, theme } from '@tarodan/ui-native';

import { styles } from '../_lib/styles';
import type { HelpController } from '../_hooks/useHelp';

const { colors } = theme;

/** Search header, quick links, and the FAQ category/question accordion. */
export function HelpFaq({ f }: { f: HelpController }) {
  return (
    <>
      {/* Search */}
      <View style={styles.searchSection}>
        <Text style={styles.searchTitle}>Nasıl yardımcı olabiliriz?</Text>
        <Input
          placeholder="Soru veya konu ara..."
          value={f.searchQuery}
          onChangeText={f.handleSearch}
          leftIconName="search"
        />
      </View>

      {/* Quick Links */}
      <View style={styles.quickLinks}>
        <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/order-track')}>
          <Ionicons name="location-outline" size={28} color={colors.primary[600]!} />
          <Text style={styles.quickLinkText}>Sipariş Takip</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickLink} onPress={() => router.push('/(auth)/login')}>
          <Ionicons name="person-outline" size={28} color={colors.primary[600]!} />
          <Text style={styles.quickLinkText}>Giriş Yap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickLink} onPress={() => f.setExpandedCategory('selling')}>
          <Ionicons name="pricetag-outline" size={28} color={colors.primary[600]!} />
          <Text style={styles.quickLinkText}>Satış Yap</Text>
        </TouchableOpacity>
      </View>

      {/* FAQ Section */}
      <View style={styles.faqSection}>
        <Text style={styles.sectionTitle}>Sıkça Sorulan Sorular</Text>

        {f.filteredFAQs.map(category => (
          <View key={category.id} style={styles.faqCategory}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() => f.setExpandedCategory(f.expandedCategory === category.id ? null : category.id)}
            >
              <View style={styles.categoryTitle}>
                <Ionicons name={category.icon as any} size={24} color={colors.primary[600]!} />
                <Text style={styles.categoryTitleText}>{category.title}</Text>
                <View style={styles.questionCount}>
                  <Text style={styles.questionCountText}>{category.questions.length}</Text>
                </View>
              </View>
              <Ionicons
                name={f.expandedCategory === category.id ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={colors.text.muted}
              />
            </TouchableOpacity>

            {f.expandedCategory === category.id && (
              <View style={styles.questionsList}>
                {category.questions.map((item, index) => (
                  <View key={index} style={styles.questionItem}>
                    <TouchableOpacity
                      style={styles.questionHeader}
                      onPress={() => f.setExpandedQuestion(
                        f.expandedQuestion === `${category.id}-${index}` ? null : `${category.id}-${index}`
                      )}
                    >
                      <Text style={styles.questionText}>{item.q}</Text>
                      <Ionicons
                        name={f.expandedQuestion === `${category.id}-${index}` ? 'remove' : 'add'}
                        size={20}
                        color={colors.primary[600]!}
                      />
                    </TouchableOpacity>
                    {f.expandedQuestion === `${category.id}-${index}` && (
                      <Text style={styles.answerText}>{item.a}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
    </>
  );
}
