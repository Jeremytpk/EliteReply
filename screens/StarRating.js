// StarRating.js
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const StarRating = ({ rating, setRating, maxStars = 5, size = 30, color = '#FFD700' }) => {
  const stars = [];
  for (let i = 1; i <= maxStars; i++) {
    stars.push(
      <TouchableOpacity key={i} onPress={() => setRating(i)}>
        <Ionicons
          name={i <= rating ? 'star' : 'star-outline'} // Renders a filled star if 'i' is less than or equal to current rating, else an outlined star
          size={size}
          color={color}
        />
      </TouchableOpacity>
    );
  }
  return <View style={styles.starRatingContainer}>{stars}</View>;
};

const styles = StyleSheet.create({
  starRatingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 5,
  },
});

export default StarRating;