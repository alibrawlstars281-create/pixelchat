class ChatMessage {
  final String role;
  final String? text;
  final String? imagePath;
  final String? fileName;
  final DateTime timestamp;
  final bool isLoading;

  ChatMessage({
    required this.role,
    this.text,
    this.imagePath,
    this.fileName,
    DateTime? timestamp,
    this.isLoading = false,
  }) : timestamp = timestamp ?? DateTime.now();
}
