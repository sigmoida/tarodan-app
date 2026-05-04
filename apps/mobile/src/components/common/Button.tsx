/**
 * Custom Button Component
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons as Icon } from '@expo/vector-icons';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  icon?: string;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  textStyle,
}) => {
  const getContainerStyle = () => {
    const styles: ViewStyle[] = [baseStyles.container, baseStyles[`${size}Container`]];
    
    switch (variant) {
      case 'primary':
        styles.push(baseStyles.primaryContainer);
        break;
      case 'secondary':
        styles.push(baseStyles.secondaryContainer);
        break;
      case 'outline':
        styles.push(baseStyles.outlineContainer);
        break;
      case 'ghost':
        styles.push(baseStyles.ghostContainer);
        break;
    }
    
    if (disabled || loading) {
      styles.push(baseStyles.disabledContainer);
    }
    
    if (fullWidth) {
      styles.push(baseStyles.fullWidth);
    }
    
    return styles;
  };

  const getTextStyle = () => {
    const styles: TextStyle[] = [baseStyles.text, baseStyles[`${size}Text`]];
    
    switch (variant) {
      case 'primary':
        styles.push(baseStyles.primaryText);
        break;
      case 'secondary':
        styles.push(baseStyles.secondaryText);
        break;
      case 'outline':
        styles.push(baseStyles.outlineText);
        break;
      case 'ghost':
        styles.push(baseStyles.ghostText);
        break;
    }
    
    return styles;
  };

  const getIconColor = () => {
    switch (variant) {
      case 'primary':
      case 'secondary':
        return '#FFF';
      case 'outline':
      case 'ghost':
        return '#E53935';
    }
  };

  const iconSize = size === 'small' ? 16 : size === 'medium' ? 18 : 20;

  return (
    <TouchableOpacity
      style={[...getContainerStyle(), style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator 
          color={variant === 'primary' || variant === 'secondary' ? '#FFF' : '#E53935'} 
          size="small" 
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Icon name={icon as any} size={iconSize} color={getIconColor()} style={baseStyles.iconLeft} />
          )}
          <Text style={[...getTextStyle(), textStyle]}>{title}</Text>
          {icon && iconPosition === 'right' && (
            <Icon name={icon as any} size={iconSize} color={getIconColor()} style={baseStyles.iconRight} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
};

const baseStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  fullWidth: {
    width: '100%',
  },
  
  // Sizes
  smallContainer: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  mediumContainer: {
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  largeContainer: {
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  
  // Variants
  primaryContainer: {
    backgroundColor: '#E53935',
    shadowColor: '#E53935',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryContainer: {
    backgroundColor: '#424242',
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#E53935',
  },
  ghostContainer: {
    backgroundColor: 'transparent',
  },
  disabledContainer: {
    opacity: 0.6,
  },
  
  // Text
  text: {
    fontWeight: '600',
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  primaryText: {
    color: '#FFF',
  },
  secondaryText: {
    color: '#FFF',
  },
  outlineText: {
    color: '#E53935',
  },
  ghostText: {
    color: '#E53935',
  },
  
  // Icons
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});

export default Button;


