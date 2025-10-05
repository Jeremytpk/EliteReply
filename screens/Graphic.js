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

// Responsive design constants
const getResponsiveValues = (screenWidth) => {
  if (screenWidth < 350) {
    // Very small phones
    return {
      padding: 12,
      chartMargin: 15,
      titleSize: 20,
      chartTitleSize: 16,
      chartHeight: 180,
      buttonPadding: 8,
      buttonFontSize: 12,
    };
  } else if (screenWidth < 400) {
    // Small phones
    return {
      padding: 16,
      chartMargin: 18,
      titleSize: 22,
      chartTitleSize: 17,
      chartHeight: 200,
      buttonPadding: 10,
      buttonFontSize: 13,
    };
  } else {
    // Regular and large screens
    return {
      padding: 20,
      chartMargin: 20,
      titleSize: 24,
      chartTitleSize: 18,
      chartHeight: 220,
      buttonPadding: 12,
      buttonFontSize: 14,
    };
  }
};

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

      // Ensure chart data has minimum values to prevent rendering issues
      const ensureMinimumData = (data) => {
        const maxValue = Math.max(...data);
        return maxValue === 0 ? data.map(() => 0.1) : data;
      };

      setChartData({
        day: {
          labels: Array.from(dailyCountsMap.keys()),
          datasets: [{ data: ensureMinimumData(Array.from(dailyCountsMap.values())) }],
          total: dayTotal,
        },
        month: {
          labels: Array.from(monthlyCountsMap.keys()),
          datasets: [{ data: ensureMinimumData(Array.from(monthlyCountsMap.values())) }],
          total: monthTotal,
        },
        year: {
          labels: Array.from(yearlyCountsMap.keys()),
          datasets: [{ data: ensureMinimumData(Array.from(yearlyCountsMap.values())) }],
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

  // Get responsive values based on current screen width
  const responsive = getResponsiveValues(screenDimensions.width);
  
  // Calculate chart width with proper padding for centering and preventing overflow
  const chartWidth = Math.min(
    screenDimensions.width - (responsive.padding * 2) - 60,
    screenDimensions.width * 0.85
  );
  
  // Enhanced chart configuration for mobile
  const getMobileOptimizedChartConfig = () => {
    const isSmallScreen = screenDimensions.width < 400;
    
    return {
      backgroundColor: '#ffffff',
      backgroundGradientFrom: '#ffffff',
      backgroundGradientTo: '#f8f9fa',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(10, 143, 223, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(60, 60, 67, ${opacity})`,
      style: {
        borderRadius: 12,
      },
      propsForDots: {
        r: isSmallScreen ? '4' : '6',
        strokeWidth: '2',
        stroke: '#0a8fdf',
        fill: '#ffffff',
        shadowColor: '#0a8fdf',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      propsForBackgroundLines: {
        strokeDasharray: '',
        stroke: '#e0e0e0',
        strokeWidth: 1,
      },
      paddingRight: isSmallScreen ? 30 : 40,
      paddingLeft: isSmallScreen ? 20 : 25,
      yAxisInterval: 1,
      segments: 4, // Control number of horizontal grid lines
      formatYLabel: (yLabel) => {
        const num = Math.round(Number(yLabel));
        // Ensure unique Y labels and better formatting
        return num >= 1000 ? `${(num / 1000).toFixed(1)}k` : num.toString();
      },
      formatXLabel: (xLabel, index) => {
        // Show every nth label to prevent overlap
        const showEvery = isSmallScreen ? 3 : 2;
        if (index % showEvery !== 0) return '';
        return isSmallScreen && xLabel.length > 4 ? `${xLabel.slice(0, 3)}` : xLabel;
      },
    };
  };

  const chartConfig = getMobileOptimizedChartConfig();

  return (
    <View style={styles.mainContainer}>
      <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: responsive.padding }]}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <Text style={[styles.title, { fontSize: responsive.titleSize }]}>
            Croissance des {displayName}
          </Text>
          <View style={styles.statsOverview}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{chartData.day.total}</Text>
              <Text style={styles.statLabel}>Aujourd'hui</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{chartData.month.total}</Text>
              <Text style={styles.statLabel}>Ce mois</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{chartData.year.total}</Text>
              <Text style={styles.statLabel}>Cette année</Text>
            </View>
          </View>
        </View>

        {/* Day Chart Section */}
        <View style={[styles.chartWrapper, { marginBottom: responsive.chartMargin }]}>
          <ViewShot ref={dayChartRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.chartSection}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { fontSize: responsive.chartTitleSize }]}>
                📊 Par Jour (dernières 24h)
              </Text>
              <View style={styles.chartBadge}>
                <Text style={styles.chartBadgeText}>{chartData.day.total}</Text>
              </View>
            </View>
            <LineChart
              data={chartData.day}
              width={chartWidth}
              height={responsive.chartHeight}
              chartConfig={chartConfig}
              bezier
              style={styles.chartStyle}
              xLabelsOffset={-5}
              yLabelsOffset={5}
              fromZero={true}
              withHorizontalLabels={true}
              withVerticalLabels={true}
              withDots={true}
              withShadow={false}
              segments={4}
            />
            <View style={styles.legendContainer}>
              <Text style={styles.legendText}>
                Nouveaux {displayName} par heure au cours des dernières 24 heures.
              </Text>
            </View>
          </ViewShot>
          <View style={styles.downloadButtonsContainer}>
            <TouchableOpacity 
              style={[styles.downloadButton, { paddingVertical: responsive.buttonPadding }]} 
              onPress={() => downloadImage(dayChartRef, 'Graphique Journalier')}
            >
              <Text style={[styles.downloadButtonText, { fontSize: responsive.buttonFontSize }]}>
                📥 JPG
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.downloadButton, { paddingVertical: responsive.buttonPadding }]} 
              onPress={() => downloadCSV(chartData.day, 'Graphique Journalier')}
            >
              <Text style={[styles.downloadButtonText, { fontSize: responsive.buttonFontSize }]}>
                📊 CSV
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Month Chart Section */}
        <View style={[styles.chartWrapper, { marginBottom: responsive.chartMargin }]}>
          <ViewShot ref={monthChartRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.chartSection}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { fontSize: responsive.chartTitleSize }]}>
                📈 Par Mois (derniers 30 jours)
              </Text>
              <View style={styles.chartBadge}>
                <Text style={styles.chartBadgeText}>{chartData.month.total}</Text>
              </View>
            </View>
            <LineChart
              data={chartData.month}
              width={chartWidth}
              height={responsive.chartHeight}
              chartConfig={chartConfig}
              bezier
              style={styles.chartStyle}
              xLabelsOffset={-5}
              yLabelsOffset={5}
              fromZero={true}
              withHorizontalLabels={true}
              withVerticalLabels={true}
              withDots={true}
              withShadow={false}
              segments={4}
            />
            <View style={styles.legendContainer}>
              <Text style={styles.legendText}>
                Nouveaux {displayName} par jour au cours des 30 derniers jours.
              </Text>
            </View>
          </ViewShot>
          <View style={styles.downloadButtonsContainer}>
            <TouchableOpacity 
              style={[styles.downloadButton, { paddingVertical: responsive.buttonPadding }]} 
              onPress={() => downloadImage(monthChartRef, 'Graphique Mensuel')}
            >
              <Text style={[styles.downloadButtonText, { fontSize: responsive.buttonFontSize }]}>
                📥 JPG
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.downloadButton, { paddingVertical: responsive.buttonPadding }]} 
              onPress={() => downloadCSV(chartData.month, 'Graphique Mensuel')}
            >
              <Text style={[styles.downloadButtonText, { fontSize: responsive.buttonFontSize }]}>
                📊 CSV
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Year Chart Section */}
        <View style={[styles.chartWrapper, { marginBottom: responsive.chartMargin + 60 }]}>
          <ViewShot ref={yearChartRef} options={{ format: 'jpg', quality: 0.9 }} style={styles.chartSection}>
            <View style={styles.chartHeader}>
              <Text style={[styles.chartTitle, { fontSize: responsive.chartTitleSize }]}>
                📅 Par Année (derniers 12 mois)
              </Text>
              <View style={styles.chartBadge}>
                <Text style={styles.chartBadgeText}>{chartData.year.total}</Text>
              </View>
            </View>
            <LineChart
              data={chartData.year}
              width={chartWidth}
              height={responsive.chartHeight}
              chartConfig={chartConfig}
              bezier
              style={styles.chartStyle}
              xLabelsOffset={-5}
              yLabelsOffset={5}
              fromZero={true}
              withHorizontalLabels={true}
              withVerticalLabels={true}
              withDots={true}
              withShadow={false}
              segments={4}
            />
            <View style={styles.legendContainer}>
              <Text style={styles.legendText}>
                Nouveaux {displayName} par mois au cours des 12 derniers mois.
              </Text>
            </View>
          </ViewShot>
          <View style={styles.downloadButtonsContainer}>
            <TouchableOpacity 
              style={[styles.downloadButton, { paddingVertical: responsive.buttonPadding }]} 
              onPress={() => downloadImage(yearChartRef, 'Graphique Annuel')}
            >
              <Text style={[styles.downloadButtonText, { fontSize: responsive.buttonFontSize }]}>
                📥 JPG
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.downloadButton, { paddingVertical: responsive.buttonPadding }]} 
              onPress={() => downloadCSV(chartData.year, 'Graphique Annuel')}
            >
              <Text style={[styles.downloadButtonText, { fontSize: responsive.buttonFontSize }]}>
                📊 CSV
              </Text>
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
    backgroundColor: '#f5f7fa',
  },
  container: {
    flexGrow: 1,
    backgroundColor: 'transparent',
    paddingVertical: 15,
    paddingBottom: 80, // Extra space for floating button
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  headerContainer: {
    marginBottom: 25,
    paddingHorizontal: 5,
  },
  title: {
    fontWeight: '700',
    marginBottom: 20,
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  statsOverview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 0.5,
    borderColor: '#e0e6ed',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0a8fdf',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  chartWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  chartSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    width: '100%',
    borderWidth: 0.5,
    borderColor: '#e0e6ed',
    overflow: 'hidden',
    alignItems: 'center',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  chartTitle: {
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
    letterSpacing: 0.3,
  },
  chartBadge: {
    backgroundColor: '#0a8fdf',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    minWidth: 50,
    alignItems: 'center',
  },
  chartBadgeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  chartStyle: {
    marginVertical: 8,
    borderRadius: 12,
    alignSelf: 'center',
  },
  legendContainer: {
    marginTop: 12,
    paddingHorizontal: 8,
    backgroundColor: '#f8fafc',
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#0a8fdf',
  },
  legendText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'left',
    lineHeight: 16,
    fontWeight: '500',
  },

  downloadButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 4,
  },
  downloadButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0a8fdf',
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 4,
    flex: 1,
    alignItems: 'center',
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  downloadButtonText: {
    color: '#0a8fdf',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  floatingButton: {
    position: 'absolute',
    bottom: 25,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#0a8fdf',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  floatingButtonIcon: {
    width: 26,
    height: 26,
    tintColor: '#ffffff',
    resizeMode: 'contain',
  },
});

export default Graphic;