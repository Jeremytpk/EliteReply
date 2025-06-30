import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      title: '📱 Télécommunications',
      questions: [
        {
          q: 'Q1. Comment EliteReply aide les opérateurs télécoms ?',
          a: '→ Gestion des plaintes (facturation, réseau, forfaits) via WhatsApp/SMS.\n→ Activation de services par chat (ex : *"Envoyez 123# pour recharger").'
        },
        {
          q: 'Q2. Pouvons-nous intégrer EliteReply à notre système CRM ?',
          a: 'Oui ! API compatible avec Orange Money, Airtel, Vodacom, etc.'
        }
      ]
    },
    {
      id: 'transport',
      title: '🚚 Transport & Logistique',
      questions: [
        {
          q: 'Q3. Comment optimiser le suivi des livraisons avec EliteReply ?',
          a: '→ Alertes automatiques aux clients (retards, numéros de suivi).\n→ Support B2B pour chauffeurs et fournisseurs (bilingue).'
        },
        {
          q: 'Q4. Gérez-vous les réclamations pour les compagnies aériennes ?',
          a: 'Oui ! Chat dédié pour :\n\n• Changement de vol.\n• Remboursements.\n• Infos bagages.'
        }
      ]
    },
    {
      id: 'sante',
      title: '🏥 Santé & Pharmacies',
      questions: [
        {
          q: 'Q5. Comment EliteReply améliore l\'accès aux soins ?',
          a: '→ Prise de RDV automatisée via WhatsApp.\n→ Rappels de médicaments (messagerie cryptée Hippocrate-compatible).'
        },
        {
          q: 'Q6. Vos agents comprennent-ils les termes médicaux ?',
          a: 'Oui ! Nous formons nos agents aux bases de la santé (protocoles confidentiels).'
        }
      ]
    },
    {
      id: 'education',
      title: '🎓 Éducation & Universités',
      questions: [
        {
          q: 'Q7. Pouvons-nous utiliser EliteReply pour les inscriptions étudiantes ?',
          a: 'Absolument ! Chatbots pour :\n\n• FAQ sur les filières.\n• Paiement des frais scolaires.\n• Alertes de rentrée.'
        },
        {
          q: 'Q8. Prenez-vous en charge les parents non connectés ?',
          a: 'Oui, via SMS (forfaits adaptés aux écoles rurales).'
        }
      ]
    },
    {
      id: 'voyage',
      title: '✈️ Agences de Voyage & Compagnies Aériennes',
      questions: [
        {
          q: 'Q9. Comment boostez-vous les réservations ?',
          a: '→ Réponses instantanées aux questions sur les visas, promotions, etc.\n→ Intégration avec Amadeus/Sabre (sur demande).'
        },
        {
          q: 'Q10. Que faire en cas d\'urgence voyage (ex : vol annulé) ?',
          a: 'Nos agents priorisent les urgences 24h/24 et informent les clients par SMS/chat.'
        }
      ]
    },
    {
      id: 'commerce',
      title: '🛍️ Commerces (Stores, E-commerce)',
      questions: [
        {
          q: 'Q11. Comment EliteReply augmente mes ventes ?',
          a: '→ Conversion des visiteurs en clients via chat en direct ("Besoin d\'aide pour commander ?").\n→ Relance des paniers abandonnés.'
        },
        {
          q: 'Q12. Puis-je lier EliteReply à ma boutique Shopify ?',
          a: 'Oui ! Notification des commandes + suivi livraison.'
        }
      ]
    },
    {
      id: 'pme',
      title: '🚀 Startups & PME',
      questions: [
        {
          q: 'Q13. Je suis une petite entreprise – puis-je me le permettre ?',
          a: 'Oui ! Forfaits dès $100/mois (50 chats inclus).'
        },
        {
          q: 'Q14. Comment scalez-vous avec ma croissance ?',
          a: 'Passage seamless de l\'humain à l\'IA + humain quand vous grandissez.'
        }
      ]
    },
    {
      id: 'industrie',
      title: '🏭 Fabrication & Industrie',
      questions: [
        {
          q: 'Q15. Comment fluidifier la chaîne d\'approvisionnement ?',
          a: '→ Chat dédié aux fournisseurs pour :\n\n• Commandes urgentes.\n• Problèmes logistiques.'
        },
        {
          q: 'Q16. Vos agents comprennent-ils les spécificités techniques ?',
          a: 'Oui ! Formation sur mesure à vos produits/processus.'
        }
      ]
    },
    {
      id: 'securite',
      title: '🔐 Sécurité & Données (Tous Secteurs)',
      questions: [
        {
          q: 'Q17. Où sont stockées nos données ?',
          a: 'Serveurs locaux (RDC) + cryptage niveau bancaire.'
        },
        {
          q: 'Q18. Puis-je auditer la sécurité ?',
          a: 'Oui ! Rapport annuel disponible sur demande.'
        }
      ]
    }
  ];

  const openContact = () => {
    Linking.openURL('mailto:contact@elitereply.cd');
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
          <View key={section.id} style={styles.sectionContainer}>
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => toggleSection(section.id)}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Ionicons 
                name={expandedSections[section.id] ? 'chevron-up' : 'chevron-down'} 
                size={20} 
                color="#4a6bff" 
              />
            </TouchableOpacity>

            {expandedSections[section.id] && (
              <View style={styles.questionsContainer}>
                {section.questions.map((item, index) => (
                  <View key={index} style={styles.questionItem}>
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
            <Ionicons name="checkmark-circle" size={16} color="#4a6bff" />
            <Text style={styles.benefitText}>Secteur-Spécifique : Agents formés à votre domaine</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={16} color="#4a6bff" />
            <Text style={styles.benefitText}>Hybride Humain/IA : Équilibre coût/efficacité</Text>
          </View>
          <View style={styles.benefitItem}>
            <Ionicons name="checkmark-circle" size={16} color="#4a6bff" />
            <Text style={styles.benefitText}>Kinshasa-Certifié : Adapté aux réalités locales (défis internet, multilinguisme)</Text>
          </View>
        </View>

        <View style={styles.ctaContainer}>
          <Text style={styles.ctaText}>Testez sans risque : 7 jours gratuits !</Text>
          <TouchableOpacity style={styles.contactButton} onPress={openContact}>
            <Text style={styles.contactButtonText}>Contact : contact@elitereply.info</Text>
          </TouchableOpacity>
          {/*
          <TouchableOpacity style={styles.whatsappButton} onPress={openWhatsApp}>
            <Ionicons name="logo-whatsapp" size={20} color="white" />
            <Text style={styles.whatsappButtonText}>WhatsApp : +243 XXX XXX XXX</Text>
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
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  sectionContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  questionsContainer: {
    padding: 16,
  },
  questionItem: {
    marginBottom: 16,
  },
  questionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  answerText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  whyContainer: {
    backgroundColor: '#f0f4ff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 24,
  },
  whyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  benefitText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  ctaContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
    textAlign: 'center',
  },
  contactButton: {
    backgroundColor: '#e9ecef',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactButtonText: {
    fontSize: 14,
    color: '#333',
  },
  whatsappButton: {
    backgroundColor: '#25D366',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default FAQ;