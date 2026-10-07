import 'package:flutter/material.dart';

import '../../../core/api/api_client.dart';
import '../data/vehicle_repository.dart';
import 'listing_chat_screen.dart';

class InboxScreen extends StatefulWidget {
  const InboxScreen({super.key});
  @override
  State<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends State<InboxScreen> {
  final _repository = VehicleRepository(ApiClient());
  late Future<List<Map<String, dynamic>>> _chats = _repository.chats();
  void _reload() {
    final next = _repository.chats();
    setState(() {
      _chats = next;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('الرسائل')),
        body: FutureBuilder<List<Map<String, dynamic>>>(
            future: _chats,
            builder: (context, snapshot) {
              if (!snapshot.hasData)
                return Center(
                    child: snapshot.hasError
                        ? TextButton.icon(
                            onPressed: _reload,
                            icon: const Icon(Icons.refresh),
                            label: const Text('إعادة المحاولة'))
                        : const CircularProgressIndicator());
              if (snapshot.data!.isEmpty)
                return const Center(child: Text('لا توجد محادثات بعد'));
              return RefreshIndicator(
                onRefresh: () async {
                  _reload();
                  await _chats;
                },
                child: ListView.builder(
                    itemCount: snapshot.data!.length,
                    itemBuilder: (context, index) {
                      final chat = snapshot.data![index];
                      final vehicle = chat['vehicle'] as Map<String, dynamic>;
                      return ListTile(
                        leading: const CircleAvatar(
                            child: Icon(Icons.chat_bubble_outline)),
                        title: Text('${vehicle['make']} ${vehicle['model']}'),
                        subtitle: Text(
                            '${chat['otherName'] ?? ''} · ${chat['lastMessage'] ?? 'محادثة جديدة'}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        onTap: () async {
                          await Navigator.push(
                              context,
                              MaterialPageRoute(
                                  builder: (_) => ListingChatScreen(
                                      chatId: chat['id'] as String)));
                          _reload();
                        },
                      );
                    }),
              );
            }),
      );
}
