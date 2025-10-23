import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, TextInput, Image, ActivityIndicator } from 'react-native';

const PromotionEditorModal = ({
  visible,
  onClose,
  newPromotion,
  setNewPromotion,
  pickImage,
  uploading,
  loading,
  handleAddPromotion,
  styles,
  CLOSE_ICON,
  IMAGE_PICKER_ICON
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={false}
      visible={visible}
      onRequestClose={onClose}
    >
      <ScrollView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add New Promotion</Text>
          <TouchableOpacity onPress={onClose}>
            <Image source={CLOSE_ICON} style={styles.customModalCloseIcon} />
          </TouchableOpacity>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter promotion title"
            value={newPromotion.title}
            onChangeText={(text) => setNewPromotion({...newPromotion, title: text})}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Enter brief promotion details"
            multiline
            numberOfLines={3}
            value={newPromotion.description}
            onChangeText={(text) => setNewPromotion({...newPromotion, description: text})}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>More Information</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Provide detailed information about the promotion"
            multiline
            numberOfLines={6}
            value={newPromotion.moreInformation}
            onChangeText={(text) => setNewPromotion({...newPromotion, moreInformation: text})}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Image</Text>
          <TouchableOpacity
            style={styles.imagePickerButton}
            onPress={pickImage}
          >
            {newPromotion.image ? (
              <Image
                source={{ uri: newPromotion.image }}
                style={styles.imagePreview}
              />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Image source={IMAGE_PICKER_ICON} style={styles.customImagePickerIcon} />
                <Text style={styles.imagePlaceholderText}>Select an image</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={onClose}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.submitButton]}
            onPress={handleAddPromotion}
            disabled={loading || uploading}
          >
            {loading || uploading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Add Promotion</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Modal>
  );
};

export default PromotionEditorModal;
