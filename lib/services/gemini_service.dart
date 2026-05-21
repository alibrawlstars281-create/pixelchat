import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:google_generative_ai/google_generative_ai.dart';

class GeminiService {
  static const String _apiKey = 'AIzaSyD-hHNs6WLz0oC-0vFVKokcnyd7iVmpW58';
  late final GenerativeModel _model;

  GeminiService() {
    _model = GenerativeModel(
      model: 'gemini-2.0-flash',
      apiKey: _apiKey,
    );
  }

  Future<String> sendMessage({
    required String text,
    Uint8List? imageBytes,
    String? fileName,
  }) async {
    try {
      final contentParts = <Part>[];

      if (imageBytes != null && fileName != null) {
        final mimeType = _getMimeType(fileName);
        contentParts.add(DataPart(mimeType, imageBytes));
      }

      if (text.isNotEmpty) {
        contentParts.add(TextPart(text));
      }

      final response = await _model.generateContent([
        Content.multi(contentParts),
      ]);

      return response.text ?? 'Üzgünüm, bir yanıt oluşturulamadı.';
    } catch (e) {
      return 'Hata: $e';
    }
  }

  Stream<String> sendMessageStream({
    required String text,
    Uint8List? imageBytes,
    String? fileName,
  }) async* {
    try {
      final contentParts = <Part>[];

      if (imageBytes != null && fileName != null) {
        final mimeType = _getMimeType(fileName);
        contentParts.add(DataPart(mimeType, imageBytes));
      }

      if (text.isNotEmpty) {
        contentParts.add(TextPart(text));
      }

      final response = _model.generateContentStream([
        Content.multi(contentParts),
      ]);

      await for (final chunk in response) {
        if (chunk.text != null) {
          yield chunk.text!;
        }
      }
    } catch (e) {
      yield 'Hata: $e';
    }
  }

  String _getMimeType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      case 'json':
        return 'application/json';
      case 'mp3':
      case 'wav':
        return 'audio/mpeg';
      case 'mp4':
        return 'video/mp4';
      default:
        return 'application/octet-stream';
    }
  }
}
