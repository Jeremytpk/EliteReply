import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import ViewShot from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system'; // Ensure this is imported for CSV download

// Import rotation icon
const ROTATE_ICON = require('../assets/icons/refresh.png');

const PADDING_HORIZONTAL = 20; // Consistent padding for content
const CHART_MARGIN_BOTTOM = 20; // Space between chart sections

const Graphic = () => {
  const route = useRoute();
  const { dataType, displayName } = route.params;
  const [loading, setLoading] = useState(true);
  const [isLandscape, setIsLandscape] = useState(false);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));
  const [chartData, setChartData] = useState({
    day: { labels: [], datasets: [{ data: [] }], total: 0 },
    month: { labels: [], datasets: [{ data: [] }], total: 0 },
    year: { labels: [], datasets: [{ data: [] }], total: 0 },
  });

  // Refs for each chart section to capture screenshots
  const dayChartRef = useRef();
  const monthChartRef = useRef();
  const yearChartRef = useRef();

  // --- Orientation Management ---
  useEffect(() => {
    const initializeOrientation = async () => {
      // Start in portrait mode by default
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      setIsLandscape(false);
    };

    const cleanup = async () => {
      // Revert to portrait when component unmounts
      await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };

    initializeOrientation();

    // Listen for dimension changes to update chart sizes
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions(window);
      // Update landscape state based on dimensions
      setIsLandscape(window.width > window.height);
    });

    return () => {
      cleanup();
      subscription?.remove();
    };
  }, []);

  // Function to toggle orientation
  const toggleOrientation = async () => {
    try {
      if (isLandscape) {
        // Switch to portrait
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        // Switch to landscape
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
        setIsLandscape(true);
      }
    } catch (error) {
      console.error('Error changing orientation:', error);
      Alert.alert('Erreur', 'Impossible de changer l\'orientation de l\'écran.');
    }
  };
  // --- End Orientation Management ---

  const getGrowthData = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, dataType));
      const data = querySnapshot.docs.map((doc) => doc.data());

      const now = new Date();

      // Helper to set date to start of day
      const getStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

      // Data for 'Day' (last 24 hours - by hour)
      const dailyCountsMap = new Map();
      let dayTotal = 0;
      for (let i = 23; i >= 0; i--) {
        const hour = (now.getHours() - i + 24) % 24; // Ensure hours are correct and wrap around
        dailyCountsMap.set(hour.toString().padStart(2, '0') + 'h', 0); // Format as "00h"
      }

      // Data for 'Month' (last 30 days - by day)
      const monthlyCountsMap = new Map();
      let monthTotal = 0;
      for (let i = 29; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const day = date.getDate();
        const month = date.getMonth() + 1;
        monthlyCountsMap.set(`${day}/${month}`, 0);
      }

      // Data for 'Year' (last 12 months - by month)
      const yearlyCountsMap = new Map();
      let yearTotal = 0;
      for (let i = 11; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthName = monthDate.toLocaleString('fr-FR', { month: 'short' });
        yearlyCountsMap.set(monthName, 0);
      }

      data.forEach((item) => {
        const createdAt = item.createdAt?.toDate();
        if (createdAt) {
          // Daily
          const startOfCreatedAtDay = getStartOfDay(createdAt);
          const startOfNowDay = getStartOfDay(now);
          const diffMsToday = startOfNowDay.getTime() - startOfCreatedAtDay.getTime();
          const diffHoursFromNow = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

          if (diffHoursFromNow >= 0 && diffHoursFromNow < 24) {
            const hour = createdAt.getHours().toString().padStart(2, '0') + 'h';
            dailyCountsMap.set(hour, (dailyCountsMap.get(hour) || 0) + 1);
            dayTotal++;
          }

          // Monthly
          const diffDays = Math.floor((startOfNowDay.getTime() - startOfCreatedAtDay.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays >= 0 && diffDays < 30) {
            const day = createdAt.getDate();
            const month = createdAt.getMonth() + 1;
            monthlyCountsMap.set(`${day}/${month}`, (monthlyCountsMap.get(`${day}/${month}`) || 0) + 1);
            monthTotal++;
          }

          // Yearly
          const yearDiff = now.getFullYear() - createdAt.getFullYear();
          const monthDiff = now.getMonth() - createdAt.getMonth();
          const totalMonthDiff = yearDiff * 12 + monthDiff;

          if (totalMonthDiff >= 0 && totalMonthDiff < 12) {
            const monthName = createdAt.toLocaleString('fr-FR', { month: 'short' });
            yearlyCountsMap.set(monthName, (yearlyCountsMap.get(monthName) || 0) + 1);
            yearTotal++;
          }
        }
      });

      setChartData({
        day: {
          labels: Array.from(dailyCountsMap.keys()),
          datasets: [{ data: Array.from(dailyCountsMap.values()) }],
          total: dayTotal,
        },
        month: {
          labels: Array.from(monthlyCountsMap.keys()),
          datasets: [{ data: Array.from(monthlyCountsMap.values()) }],
          total: monthTotal,
        },
        year: {
          labels: Array.from(yearlyCountsMap.keys()),
          datasets: [{ data: Array.from(yearlyCountsMap.values()) }],
          total: yearTotal,
        },
      });
    } catch (error) {
      console.error('Error fetching graphic data:', error);
      Alert.alert('Erreur', 'Impossible de charger les données du graphique.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getGrowthData();
  }, [dataType]);

  // --- Download/Share Functions (unchanged, but ensure FileSystem import) ---

  const getMediaLibraryPermission = async () => {
    if (Platform.OS === 'android') {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Nous avons besoin de la permission pour accéder à la galerie photo pour enregistrer l\'image.');
        return false;
      }
      return true;
    }
    return true; // iOS usually grants permission automatically on first share/save attempt
  };

  const downloadImage = async (chartRef, chartName) => {
    try {
      const hasPermission = await getMediaLibraryPermission();
      if (!hasPermission) return;

      const uri = await chartRef.current.capture();

      if (Platform.OS === 'android') {
        const asset = await MediaLibrary.createAssetAsync(uri);
        Alert.alert('Téléchargement réussi', `L'image ${chartName} a été enregistrée dans votre galerie.`);
      } else {
        if (!(await Sharing.isAvailableAsync())) {
          Alert.alert('Partage indisponible', 'Le partage de fichiers n\'est pas disponible sur cet appareil.');
          return;
        }
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
        Alert.alert('Partage d\'image', `L'image ${chartName} est prête à être partagée.`);
      }
    } catch (error) {
      console.error(`Error downloading ${chartName} image:`, error);
      Alert.alert('Erreur', `Impossible de télécharger l'image ${chartName}.`);
    }
  };

  const downloadCSV = async (data, chartName) => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Partage indisponible', 'Le partage de fichiers n\'est pas disponible sur cet appareil.');
        return;
      }

      const headers = ['Label', 'Value'];
      const rows = data.labels.map((label, index) => `${label},${data.datasets[0].data[index]}`);
      const csvString = `${headers.join(',')}\n${rows.join('\n')}`;

      const fileUri = `${FileSystem.cacheDirectory}${chartName.replace(/\s/g, '_')}_${displayName.replace(/\s/g, '_')}_${new Date().getTime()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csvString, { encoding: FileSystem.EncodingType.UTF8 });

      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', UTI: 'public.csv' });
      Alert.alert('Fichier CSV', `Le fichier CSV pour ${chartName} est prêt à être partagé.`);
    } catch (error) {
      console.error(`Error downloading ${chartName} CSV:`, error);
      Alert.alert('Erreur', `Impossible de télécharger le fichier CSV pour ${chartName}.`);
    }
  };

  // --- End Download/Share Functions ---

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  // Calculate chart width dynamically based on current screen dimensions
  const chartWidth = screenDimensions.width - (PADDING_HORIZONTAL * 2);

  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0, // No decimal places for counts
    color: (opacity = 1) => `rgba(10, 143, 223, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
      borderRadius: 16,
    },
    propsForDots: {
      r: '6',
      strokeWidth: '2',
      stroke: '#ffa726',
    },
    // Ensure labels don't get cut off
    // Adjust based on your chart's specific needs and label density
    paddingRight: 30, // Space for Y-axis labels
    paddingLeft: 30,  // Space for first X-axis label
    // Custom Y-axis intervals (optional, but good for professional look)
    yAxisInterval: 1, // At least 1 unit between labels
    formatYLabel: (yLabel) => Math.round(Number(yLabel)).toString(), // Ensure Y-labels are whole numbers
  };

  return (
    <View style={styles.mainContainer}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Croissance des {displayName}</Text>

      {/* Day Chart Section */}
      <View style={styles.chartWrapper}>
        <ViewShot ref={dayChartRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.chartSection}>
          <Text style={styles.chartTitle}>Par Jour (dernières 24h)</Text>
          <LineChart
            data={chartData.day}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chartStyle}
            // Add custom props for labels to help with density, e.g., only show every Nth label
            // labels should be visible but not overlap, this depends on label density and screen size
            xLabelsOffset={-10} // Offset X labels if they get too close to the line
            yLabelsOffset={5} // Offset Y labels if they get too close to the line
            fromZero={true} // Ensure y-axis starts from zero
          />
          <View style={styles.legendContainer}>
            <Text style={styles.legendText}>
              Nouveaux {displayName} par heure au cours des dernières 24 heures.
            </Text>
          </View>
        </ViewShot>
        <Text style={styles.totalNumber}>Total des {displayName} enregistrés aujourd'hui: **{chartData.day.total}**</Text>
        <View style={styles.downloadButtonsContainer}>
          <TouchableOpacity style={styles.downloadButton} onPress={() => downloadImage(dayChartRef, 'Graphique Journalier')}>
            <Text style={styles.downloadButtonText}>Télécharger JPG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.downloadButton} onPress={() => downloadCSV(chartData.day, 'Graphique Journalier')}>
            <Text style={styles.downloadButtonText}>Télécharger CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Month Chart Section */}
      <View style={styles.chartWrapper}>
        <ViewShot ref={monthChartRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.chartSection}>
          <Text style={styles.chartTitle}>Par Mois (derniers 30 jours)</Text>
          <LineChart
            data={chartData.month}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chartStyle}
            xLabelsOffset={-10}
            yLabelsOffset={5}
            fromZero={true}
          />
          <View style={styles.legendContainer}>
            <Text style={styles.legendText}>
              Nouveaux {displayName} par jour au cours des 30 derniers jours.
            </Text>
          </View>
        </ViewShot>
        <Text style={styles.totalNumber}>Total des {displayName} enregistrés ce mois-ci: **{chartData.month.total}**</Text>
        <View style={styles.downloadButtonsContainer}>
          <TouchableOpacity style={styles.downloadButton} onPress={() => downloadImage(monthChartRef, 'Graphique Mensuel')}>
            <Text style={styles.downloadButtonText}>Télécharger JPG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.downloadButton} onPress={() => downloadCSV(chartData.month, 'Graphique Mensuel')}>
            <Text style={styles.downloadButtonText}>Télécharger CSV</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Year Chart Section */}
      <View style={styles.chartWrapper}>
        <ViewShot ref={yearChartRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.chartSection}>
          <Text style={styles.chartTitle}>Par Année (derniers 12 mois)</Text>
          <LineChart
            data={chartData.year}
            width={chartWidth}
            height={220}
            chartConfig={chartConfig}
            bezier
            style={styles.chartStyle}
            xLabelsOffset={-10}
            yLabelsOffset={5}
            fromZero={true}
          />
          <View style={styles.legendContainer}>
            <Text style={styles.legendText}>
              Nouveaux {displayName} par mois au cours des 12 derniers mois.
            </Text>
          </View>
        </ViewShot>
        <Text style={styles.totalNumber}>Total des {displayName} enregistrés cette année: **{chartData.year.total}**</Text>
        <View style={styles.downloadButtonsContainer}>
          <TouchableOpacity style={styles.downloadButton} onPress={() => downloadImage(yearChartRef, 'Graphique Annuel')}>
            <Text style={styles.downloadButtonText}>Télécharger JPG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.downloadButton} onPress={() => downloadCSV(chartData.year, 'Graphique Annuel')}>
            <Text style={styles.downloadButtonText}>Télécharger CSV</Text>
          </TouchableOpacity>
        </View>
      </View>
      </ScrollView>

      {/* Floating Orientation Toggle Button */}
      <TouchableOpacity 
        style={styles.floatingButton} 
        onPress={toggleOrientation}
        activeOpacity={0.8}
      >
        <Image 
          source={ROTATE_ICON} 
          style={[
            styles.floatingButtonIcon,
            { transform: [{ rotate: isLandscape ? '90deg' : '0deg' }] }
          ]} 
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  container: {
    flexGrow: 1, // Allows content to scroll if it overflows
    backgroundColor: '#f8f9fa',
    paddingHorizontal: PADDING_HORIZONTAL, // Use consistent horizontal padding
    paddingVertical: 15,
    justifyContent: 'center', // Center content vertically
    alignItems: 'center', // Center content horizontally
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  chartWrapper: {
    marginBottom: CHART_MARGIN_BOTTOM, // Spacing between each chart block
    width: '100%', // Take full width available within padding
    alignItems: 'center', // Center content within the wrapper
  },
  chartSection: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    width: '100%', // Ensure chart section takes full width of its parent (chartWrapper)
    overflow: 'hidden', // Crucial to prevent content like bezier lines from overflowing
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#555',
    textAlign: 'center',
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 16,
  },
  legendContainer: {
    marginTop: 10,
    paddingHorizontal: 10,
  },
  legendText: {
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
  },
  totalNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 10,
    marginBottom: 15, // Space between number and buttons
    textAlign: 'center',
  },
  downloadButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%', // Take full width within chartWrapper
  },
  downloadButton: {
    backgroundColor: '#0a8fdf',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginHorizontal: 5,
    flex: 1,
    alignItems: 'center',
  },
  downloadButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0a8fdf',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
  },
  floatingButtonIcon: {
    width: 24,
    height: 24,
    tintColor: '#fff',
    resizeMode: 'contain',
  },
});

export default Graphic;