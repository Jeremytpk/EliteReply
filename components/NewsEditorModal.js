import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Image, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NewsEditorModal = ({
  visible,
  onClose,
  newNews,
  setNewNews,
  pickPoster,
  uploading,
  loading,
  handleAddNews,
  styles
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Add New News Article</Text>

          <TextInput
            style={styles.input}
            placeholder="Title"
            placeholderTextColor="#999"
            value={newNews.title}
            onChangeText={(text) => setNewNews({...newNews, title: text})}
          />

          <TextInput
            style={[styles.input, styles.descriptionInput]}
            placeholder="Short Description"
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
            value={newNews.description}
            onChangeText={(text) => setNewNews({...newNews, description: text})}
          />

          <TextInput
            style={[styles.input, styles.moreInfoInput]}
            placeholder="Detailed Information (Blog Content)"
            placeholderTextColor="#999"
            multiline
            numberOfLines={8}
            value={newNews.moreInformation}
            onChangeText={(text) => setNewNews({...newNews, moreInformation: text})}
          />

          <TouchableOpacity
            style={styles.imagePickerButton}
            onPress={pickPoster}
            disabled={uploading}
          >
            {newNews.poster ? (
              <Image
                source={{ uri: newNews.poster }}
                style={styles.imagePreviewInButton}
                resizeMode="cover"
              />
            ) : (
              uploading ? (
                <ActivityIndicator size="small" color="#0a8fdf" />
              ) : (
                <Text style={styles.imagePickerText}>Select Poster Image</Text>
              )
            )}
          </TouchableOpacity>

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onClose}
              disabled={loading || uploading}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.submitButton]}
              onPress={handleAddNews}
              disabled={loading || uploading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>Publish Article</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

export default NewsEditorModal;
