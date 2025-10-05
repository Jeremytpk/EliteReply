import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image // Import Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere

// --- Import your actual image files here ---
import TelecomIcon from '../assets/images/telecom_icon.png';
import TransportIcon from '../assets/images/transport_icon.png';
import HealthIcon from '../assets/images/sante_icon.png';
import EducationIcon from '../assets/images/education_icon.png';
import TravelIcon from '../assets/images/voyage_icon.png';
import CommerceIcon from '../assets/images/commerce_icon.png';
import PMEIcon from '../assets/images/pme_icon.png';
import IndustryIcon from '../assets/images/industrie_icon.png';
import SecurityIcon from '../assets/images/securite_icon.png';

// --- NEW: Import your custom icons ---
const ARROW_UP_SHORT_ICON = require('../assets/icons/arrow_upShort.png');
const ARROW_DOWN_SHORT_ICON = require('../assets/icons/arrow_downShort.png');
const CHECK_FULL_ICON = require('../assets/icons/check_full.png');
const MAIL_ICON = require('../assets/icons/mail.png');
// --- END NEW IMPORTS ---

const FAQ = () => {
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const faqData = [
    {
      id: 'telecom',
      title: 'Télécommunications',
      icon: TelecomIcon,
      questions: [
        {
          q: 'Q1. Comment EliteReply aide les utilisateurs face aux problèmes de réseau ?',
          a: 'Nous assistons les clients en collectant les détails des problèmes réseau (coupures, faible signal) et en les transmettant directement au service technique de leur opérateur télécom actuel, assurant un suivi rapide.'
        },
        {
          q: 'Q2. Puis-je partager des informations spécifiques sur mon abonnement via EliteReply pour obtenir de l\'aide ?',
          a: 'Oui, vous pouvez partager les informations nécessaires (numéro de contrat, type de forfait) via notre chat sécurisé. EliteReply facilite la communication de ces détails à votre opérateur pour une résolution plus efficace de vos requêtes.'
        }
      ]
    },
    {
      id: 'transport',
      title: 'Transport', // Shortened title
      icon: TransportIcon,
      questions: [
        {
          q: 'Q3. Quelles informations puis-je obtenir sur les trajets et tarifs via EliteReply ?',
          a: 'Nous aidons les clients à obtenir des informations sur les prix des billets, les villes desservies par nos partenaires (itinéraires), et d\'autres détails concernant les voyages.'
        },
        {
          q: 'Q4. Est-il possible de prendre rendez-vous avec un partenaire de transport via EliteReply ?',
          a: 'Oui, vous pouvez utiliser EliteReply pour réserver des rendez-vous ou des créneaux horaires avec nos partenaires de transport, que ce soit pour des consultations, des réservations de groupe ou d\'autres services.'
        }
      ]
    },
    {
      id: 'sante',
      title: 'Santé & Pharmacies',
      icon: HealthIcon,
      questions: [
        {
          q: 'Q5. Comment EliteReply facilite la prise de rendez-vous médicaux ?',
          a: 'Nous aidons les clients à prendre rendez-vous directement avec des médecins, des spécialistes ou pour des services de santé variés, simplifiant ainsi l\'accès aux soins.'
        },
        {
          q: 'Q6. EliteReply peut-il m\'aider avec d\'autres services liés à la santé ?',
          a: 'Au-delà des rendez-vous, nous pouvons assister les clients avec des informations sur les services de santé, les horaires des pharmacies de garde, ou d\'autres requêtes spécifiques en fonction de nos partenaires.'
        }
      ]
    },
    {
      id: 'education',
      title: 'Éducation & Universités',
      icon: EducationIcon,
      questions: [
        {
          q: 'Q7. Quelles informations puis-je obtenir sur les écoles et universités via EliteReply ?',
          a: 'Nous fournissons aux clients des réponses concernant les inscriptions scolaires, les frais de scolarité, les emplacements des établissements, et des listes d\'écoles ou d\'universités partenaires.'
        },
        {
          q: 'Q8. Puis-je prendre rendez-vous avec les établissements d\'enseignement via EliteReply ?',
          a: 'Oui, vous pouvez utiliser EliteReply pour réserver des rendez-vous pour des entretiens d\'admission, des visites de campus, ou des sessions d\'information avec nos partenaires éducatifs.'
        }
      ]
    },
    {
      id: 'voyage',
      title: 'Agences de Voyage',
      icon: TravelIcon,
      questions: [
        {
          q: 'Q9. EliteReply peut-il me donner des informations sur les prix des billets et destinations ?',
          a: 'Oui, nous fournissons aux clients des informations actualisées sur les prix des billets d\'avion, voyage et les destinations disponibles, selon les offres de nos partenaires.'
        },
        {
          q: 'Q10. Puis-je réserver des rendez-vous avec des agents de voyage via EliteReply ?',
          a: 'Absolument. EliteReply vous permet de planifier des rendez-vous pour discuter de vos projets de voyage, obtenir des devis personnalisés ou finaliser vos réservations avec nos partenaires.'
        }
      ]
    },
    {
      id: 'commerce',
      title: 'Commerces (Stores, E-commerce)',
      icon: CommerceIcon,
      questions: [
        {
          q: 'Q11. Comment EliteReply m\'aide à trouver des produits ou des magasins ?',
          a: 'Nous aidons les clients à obtenir des informations sur leurs questions liées aux magasins ou au shopping, comme la localisation d\'un article spécifique, la recherche de magasins proposant des promotions, ou les horaires d\'ouverture.'
        },
        {
          q: 'Q12. Puis-je poser des questions sur les stocks ou la disponibilité des produits ?',
          a: 'Oui, EliteReply peut vous connecter avec le commerce pour vérifier la disponibilité des articles, les tailles, les couleurs, ou toute autre information liée au stock avant votre visite ou commande.'
        }
      ]
    },
    {
      id: 'pme',
      title: 'Startups & PME',
      icon: PMEIcon,
      questions: [
        {
          q: 'Q13. Comment EliteReply aide les startups à devenir partenaires et à se développer ?',
          a: 'Nous offrons aux startups des solutions de communication client sur mesure, des tarifs adaptés, et un accompagnement pour intégrer EliteReply. En devenant partenaire, vous bénéficiez d\'une gestion optimisée de vos interactions clients, favorisant ainsi la croissance de votre entreprise et l\'accès à de nouveaux marchés.'
        },
        {
          q: 'Q14. Quels sont les avantages spécifiques pour une startup de s\'associer à EliteReply ?',
          a: 'En plus de nos forfaits flexibles, les startups partenaires accèdent à notre expertise en IA hybride, des outils d\'automatisation pour la gestion des demandes, et la possibilité de scalabilité rapide de leurs opérations de service client, les aidant à se concentrer sur leur cœur de métier.'
        }
      ]
    },
    {
      id: 'industrie',
      title: 'Fabrication & Industrie',
      icon: IndustryIcon,
      questions: [
        {
          q: 'Q15. Comment EliteReply facilite la communication avec les entreprises de fabrication ?',
          a: 'Nous fournissons aux clients des réponses et des liens directs avec les entreprises de fabrication partenaires. Que ce soit pour des informations sur les produits, les processus de commande, ou le support après-vente, EliteReply simplifie les interactions.'
        },
        {
          q: 'Q16. EliteReply peut-il aider avec le support client pour des produits industriels complexes ?',
          a: 'Oui ! Nos agents sont formés pour comprendre les spécificités techniques de vos produits et processus industriels. Nous aidons à fluidifier la communication entre clients et fabricants pour des questions techniques, logistiques ou de support.'
        }
      ]
    },
    {
      id: 'securite',
      title: 'Sécurité & Données (Tous Secteurs)',
      icon: SecurityIcon,
      questions: [
        {
          q: 'Q17. Comment EliteReply assure-t-il la sécurité et la confidentialité de nos données ?',
          a: 'Nous assurons à nos clients que leurs données sont en sécurité grâce à un cryptage de niveau bancaire. Nous respectons scrupuleusement notre accord de confidentialité pour protéger toutes vos informations sensibles.'
        },
        {
          q: 'Q18. Pouvons-nous avoir confiance en la gestion de nos informations par EliteReply ?',
          a: 'Absolument. La protection de vos données est notre priorité absolue. Nous mettons en œuvre des protocoles de sécurité stricts et sommes transparents concernant nos pratiques, comme détaillé dans notre politique de confidentialité, garantissant ainsi votre tranquillité d\'esprit.'
        }
      ]
    }
  ];

  const openContact = () => {
    Linking.openURL('mailto:contact@elitereply.info');
  };

  const openWhatsApp = () => {
    Linking.openURL('https://wa.me/243XXXXXXXXX');
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.headerTitle}>FAQ EliteReply</Text>
        <Text style={styles.subtitle}>Support Chat pour Tous les Secteurs</Text>
        <Text style={styles.sectionDescription}>
          (Adapté pour télécoms, transport, santé, éducation, voyage, commerce, startups, fabrication & petites entreprises)
        </Text>

        {faqData.map((section) => (
          <View key={section.id} style={styles.sectionCard}>
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => toggleSection(section.id)}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {/* --- MODIFIED: Use custom image for chevron icons --- */}
              <Image
                source={expandedSections[section.id] ? ARROW_UP_SHORT_ICON : ARROW_DOWN_SHORT_ICON}
                style={styles.customChevronIcon}
              />
              {/* --- END MODIFIED --- */}
            </TouchableOpacity>

            {expandedSections[section.id] && (
              <View style={styles.questionsContainer}>
                {section.questions.map((item, index) => (
                  <View key={index} style={styles.questionItem}>
                    {/* Render icon ONLY for the first question */}
                    {index === 0 && section.icon && (
                      <Image source={section.icon} style={styles.questionIcon} />
                    )}
                    <Text style={styles.questionText}>{item.q}</Text>
                    <Text style={styles.answerText}>{item.a}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <View style={styles.whyContainer}>
          <Text style={styles.whyTitle}>📌 Pourquoi EliteReply ?</Text>
          <View style={styles.benefitItem}>
            {/* --- MODIFIED: Use custom image for checkmark icon --- */}
            <Image source={CHECK_FULL_ICON} style={styles.customBenefitCheckIcon} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.benefitText}>Secteur-Spécifique : Agents formés à votre domaine</Text>
          </View>
          <View style={styles.benefitItem}>
            {/* --- MODIFIED: Use custom image for checkmark icon --- */}
            <Image source={CHECK_FULL_ICON} style={styles.customBenefitCheckIcon} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.benefitText}>Hybride Humain/IA : Efficacité maximisée</Text>
          </View>
        </View>

        {/* --- Contact Section Added Here --- */}
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaText}>Vous avez d'autres questions ?</Text>
          <Text style={styles.ctaSubText}>Contactez-nous pour en savoir plus sur EliteReply !</Text>
          <TouchableOpacity style={styles.contactButton} onPress={openContact}>
            {/* --- MODIFIED: Use custom image for mail icon --- */}
            <Image source={MAIL_ICON} style={styles.customButtonIcon} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.contactButtonText}>Nous Contacter par Email</Text>
          </TouchableOpacity>
          {/*
          <TouchableOpacity style={styles.whatsappButton} onPress={openWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="white" style={styles.buttonIcon} />
            <Text style={styles.whatsappButtonText}>Envoyer un WhatsApp</Text>
          </TouchableOpacity>
          */}
        </View>
         

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f6', // Lighter background for the entire screen
  },
  scrollContainer: {
    paddingVertical: 25,
    paddingHorizontal: 18, // Slightly adjusted horizontal padding
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: 28, // Larger title
    fontWeight: '800', // Bolder
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 30, // More space
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  sectionCard: { // Renamed from sectionContainer to reflect card-like appearance
    backgroundColor: 'white',
    borderRadius: 15, // More rounded corners
    marginBottom: 18, // More space between cards
    overflow: 'hidden',
    elevation: 5, // More prominent shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, // Softer shadow
    shadowRadius: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 18, // More vertical padding
    paddingHorizontal: 20, // More horizontal padding
    backgroundColor: '#f8fbfc', // Slightly off-white for header
    borderBottomWidth: 1, // Subtle separator
    borderBottomColor: '#eee',
  },
  sectionTitle: {
    fontSize: 17, // Slightly larger
    fontWeight: '700', // Bolder
    color: '#222',
    flex: 1,
    marginRight: 10,
  },
  // --- NEW STYLE for custom chevron icons ---
  customChevronIcon: {
    width: 22, // Match Ionicons size
    height: 22, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#347afc', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  questionsContainer: {
    padding: 20, // Consistent padding
  },
  questionItem: {
    marginBottom: 20, // More space between questions
    alignItems: 'flex-start',
    backgroundColor: '#ffffff', // Explicitly white background
    borderRadius: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  questionIcon: {
    width: 200, // Slightly larger icon
    height: 200,
    //borderRadius: 100, // This was commented out, leaving it as is.
    marginBottom: 12, // More space below icon
    resizeMode: 'contain',
    alignSelf: 'center', // Center the icon within its question block
  },
  questionText: {
    fontSize: 16, // Slightly larger
    fontWeight: '700', // Bolder
    color: '#333',
    marginBottom: 10, // More space below question
    lineHeight: 22,
  },
  answerText: {
    fontSize: 15, // Slightly larger
    color: '#555', // Darker gray for better contrast
    lineHeight: 22, // Better line height for readability
  },
  whyContainer: {
    backgroundColor: '#d8e7ff', // Lighter blue for this section
    borderRadius: 15,
    padding: 20,
    marginTop: 25, // More margin top
    marginBottom: 30, // More margin bottom
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  whyTitle: {
    fontSize: 20, // Larger title
    fontWeight: '800',
    color: '#0a3d99', // Darker blue for emphasis
    marginBottom: 15,
    textAlign: 'center',
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12, // More space between benefits
  },
  // --- NEW STYLE for custom benefit checkmark icon ---
  customBenefitCheckIcon: {
    width: 18, // Match Ionicons size
    height: 18, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#347afc', // Match original Ionicons color
    marginRight: 10, // Space between icon and text
  },
  // --- END NEW STYLE ---
  benefitText: {
    fontSize: 15,
    color: '#111', // Darker text
    marginLeft: 10, // This will be duplicated if also in customBenefitCheckIcon, might adjust
    flex: 1,
    lineHeight: 22,
  },
  ctaContainer: {
    backgroundColor: '#347afc', // EliteReply's primary blue
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    marginTop: 30, // Added margin top to separate from benefits
  },
  ctaText: {
    fontSize: 22, // Larger and more prominent
    fontWeight: '800',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  ctaSubText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#eef2f6', // Slightly off-white for subtitle
    marginBottom: 20,
    textAlign: 'center',
  },
  contactButton: {
    backgroundColor: '#5cb85c', // A professional green
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 10,
    width: '90%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  contactButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '700',
    marginLeft: 10, // This will be duplicated if also in customButtonIcon, might adjust
  },
  whatsappButton: {
    backgroundColor: '#25D366', // WhatsApp's brand green
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 10,
    width: '90%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappButtonText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '700',
    marginLeft: 10,
  },
  // --- NEW STYLE for custom button icon (mail) ---
  customButtonIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: 'white', // Match original Ionicons color
    marginRight: 8,
  },
  // --- END NEW STYLE ---
});

export default FAQ;