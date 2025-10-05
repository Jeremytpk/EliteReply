// src/constants/categories.js

export const APP_CATEGORIES = [
  { id: 'airBnB', name: 'AirBnB', icon: 'night-shelter' },
  { id: 'autre', name: 'Autres', icon: 'help' },
  { id: 'events', name: 'Events', icon: 'event' },
  { id: 'salon de coiffure', name: 'Salon de Coiffure', icon: 'content-cut' },
  { id: 'media', name: 'Media', icon: 'movie' },
  { id: 'technologie', name: 'Technologie', icon: 'devices' },
  { id: 'nails', name: 'Ongles', icon: 'back-hand' },
  { id: 'restaurants', name: 'Restaurants', icon: 'restaurant' },
  { id: 'sante', name: 'Santé', icon: 'local-hospital' },
  { id: 'spa', name: 'Spa', icon: 'spa' },
  { id: 'stores', name: 'Shopping', icon: 'shopping-cart' },
  { id: 'transport', name: 'Transport', icon: 'directions-bus' },
  { id: 'voyage', name: 'Voyage', icon: 'flight' },
  { id: 'justice', name: 'Justice', icon: 'balance' },
  { id: 'fret', name: 'Fret', icon: 'freight' },
].sort((a, b) => a.name.localeCompare(b.name)); // Keep them sorted alphabetically