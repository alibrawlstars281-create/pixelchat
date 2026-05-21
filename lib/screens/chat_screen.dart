import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../models/chat_message.dart';
import '../services/gemini_service.dart';
import '../theme/app_theme.dart';
import '../widgets/chat_bubble.dart';
import '../widgets/message_input.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _messages = <ChatMessage>[];
  final _scrollController = ScrollController();
  final _geminiService = GeminiService();

  void _addMessage(ChatMessage msg) {
    setState(() => _messages.add(msg));
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    }
  }

  Future<void> _onSend(String text, {String? imagePath, String? fileName}) async {
    Uint8List? imageBytes;
    if (imagePath != null) {
      final file = File(imagePath);
      if (await file.exists()) {
        imageBytes = await file.readAsBytes();
      }
    }

    _addMessage(ChatMessage(
      role: 'user',
      text: text.isEmpty ? null : text,
      imagePath: imagePath,
      fileName: fileName,
    ));

    _addMessage(ChatMessage(role: 'assistant', isLoading: true));

    final stream = _geminiService.sendMessageStream(
      text: text,
      imageBytes: imageBytes,
      fileName: fileName,
    );

    String fullResponse = '';
    await for (final chunk in stream) {
      fullResponse += chunk;
      setState(() {
        _messages.last = ChatMessage(
          role: 'assistant',
          text: fullResponse,
          timestamp: _messages.last.timestamp,
        );
      });
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: const BoxDecoration(
                color: AppTheme.accent,
                shape: BoxShape.circle,
              ),
              child: const Center(
                child: Text(
                  'P',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            const Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('PixelChat', style: TextStyle(fontSize: 17)),
                Text('Gemini AI',
                    style: TextStyle(fontSize: 12, color: Colors.white54)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: () => setState(() => _messages.clear()),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? const _WelcomeWidget()
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: _messages.length,
                    itemBuilder: (ctx, i) => ChatBubble(message: _messages[i]),
                  ),
          ),
          MessageInput(onSend: _onSend),
        ],
      ),
    );
  }
}

class _WelcomeWidget extends StatelessWidget {
  const _WelcomeWidget();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: const BoxDecoration(
                color: AppTheme.surfaceLight,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.chat_bubble_outline,
                color: AppTheme.accent,
                size: 40,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'PixelChat\'e Hoş Geldiniz',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Gemini AI ile sohbet etmeye başlayın.\nMetin, görsel ve dosya gönderebilirsiniz.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 15,
                color: AppTheme.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
