import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:record/record.dart';
import '../../../core/api/api_client.dart';
import '../data/vehicle_repository.dart';

class ListingChatScreen extends StatefulWidget {
  const ListingChatScreen({super.key, required this.chatId});
  final String chatId;

  @override
  State<ListingChatScreen> createState() => _ListingChatScreenState();
}

class _ListingChatScreenState extends State<ListingChatScreen> {
  final _repository = VehicleRepository(ApiClient());
  final _text = TextEditingController();
  late Future<Map<String, dynamic>> _conversation =
      _repository.chat(widget.chatId);
  Timer? _refreshTimer;
  Timer? _recordingTimer;
  final _recorder = AudioRecorder();
  final _player = AudioPlayer();
  String? _recordingPath;
  String? _playingId;
  int _recordingSeconds = 0;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _refreshTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted && !_sending) _refresh();
    });
  }

  void _refresh() {
    final next = _repository.chat(widget.chatId);
    setState(() {
      _conversation = next;
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _recordingTimer?.cancel();
    unawaited(_recorder.dispose());
    unawaited(_player.dispose());
    _text.dispose();
    super.dispose();
  }

  Future<void> _toggleRecording() async {
    if (_sending) return;
    if (_recordingPath != null) {
      await _stopRecording();
      return;
    }
    try {
      if (!await _recorder.hasPermission()) {
        _showError('اسمح للتطبيق باستخدام الميكروفون لإرسال رسالة صوتية.');
        return;
      }
      final path = '${Directory.systemTemp.path}/carna-voice-${DateTime.now().microsecondsSinceEpoch}.m4a';
      await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 64000), path: path);
      if (!mounted) return;
      setState(() { _recordingPath = path; _recordingSeconds = 0; });
      _recordingTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _recordingSeconds++);
        if (_recordingSeconds >= 60) unawaited(_stopRecording());
      });
    } catch (_) { _showError('تعذر بدء تسجيل الصوت.'); }
  }

  Future<void> _stopRecording({bool cancel = false}) async {
    final path = _recordingPath;
    if (path == null) return;
    _recordingTimer?.cancel();
    setState(() { _recordingPath = null; _recordingSeconds = 0; _sending = !cancel; });
    try {
      final recorded = await _recorder.stop();
      if (!cancel && recorded != null) {
        await _repository.sendVoice(widget.chatId, recorded);
        if (mounted) _refresh();
      }
    } catch (_) { _showError('تعذر إرسال الرسالة الصوتية.'); }
    finally {
      try { await File(path).delete(); } catch (_) {}
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _play(String id, String url) async {
    try {
      if (_playingId == id && _player.playing) {
        await _player.pause();
        if (mounted) setState(() => _playingId = null);
        return;
      }
      await _player.stop();
      await _player.setUrl(url);
      if (mounted) setState(() => _playingId = id);
      unawaited(_player.play().whenComplete(() {
        if (mounted && _playingId == id) setState(() => _playingId = null);
      }));
    } catch (_) { _showError('تعذر تشغيل الرسالة الصوتية.'); }
  }

  void _showError(String message) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _repository.send(widget.chatId, body);
      _text.clear();
      if (mounted) _refresh();
    } catch (_) {
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('تعذر إرسال الرسالة. حاول مرة أخرى.')));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('محادثة العرض'), actions: [
          IconButton(
              onPressed: _refresh,
              icon: const Icon(Icons.refresh),
              tooltip: 'تحديث الرسائل'),
        ]),
        body: Column(children: [
          Expanded(
              child: FutureBuilder<Map<String, dynamic>>(
            future: _conversation,
            builder: (context, snapshot) {
              if (!snapshot.hasData)
                return Center(
                    child: snapshot.hasError
                        ? TextButton.icon(
                            onPressed: _refresh,
                            icon: const Icon(Icons.refresh),
                            label: const Text('إعادة المحاولة'))
                        : const CircularProgressIndicator());
              final data = snapshot.data!;
              final vehicle = data['vehicle'] as Map<String, dynamic>;
              final messages = (data['messages'] as List<dynamic>?) ?? [];
              return Column(children: [
                ListTile(
                    title: Text('${vehicle['make']} ${vehicle['model']}'),
                    subtitle: Text('${vehicle['year']}')),
                const Divider(height: 1),
                Expanded(
                    child: ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    final message = messages[index] as Map<String, dynamic>;
                    final mine = message['senderId'] == data['currentUserId'];
                    return Align(
                      alignment:
                          mine ? Alignment.centerRight : Alignment.centerLeft,
                      child: Container(
                        constraints: const BoxConstraints(maxWidth: 300),
                        margin: const EdgeInsets.symmetric(vertical: 4),
                        padding: const EdgeInsets.all(11),
                        decoration: BoxDecoration(
                            color: mine
                                ? const Color(0xFFE9F2FF)
                                : const Color(0xFFF1F3F6),
                            borderRadius: BorderRadius.circular(6)),
                        child: message['audioUrl'] is String
                            ? Row(mainAxisSize: MainAxisSize.min, children: [
                                IconButton(
                                  onPressed: () => _play('${message['id']}', '${message['audioUrl']}'),
                                  icon: Icon(_playingId == message['id'] ? Icons.pause : Icons.play_arrow),
                                  tooltip: 'تشغيل الرسالة الصوتية',
                                ),
                                Text('رسالة صوتية ${message['audioDurationSeconds'] ?? ''} ث'),
                              ])
                            : Text('${message['body']}'),
                      ),
                    );
                  },
                )),
              ]);
            },
          )),
          SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(children: [
                  if (_recordingPath != null) ...[
                    IconButton(onPressed: () => _stopRecording(cancel: true),
                      icon: const Icon(Icons.close), tooltip: 'إلغاء التسجيل'),
                    Expanded(child: Text('تسجيل ${_recordingSeconds} / 60 ث',
                      style: const TextStyle(color: Colors.red))),
                  ] else
                  Expanded(
                      child: TextField(
                          controller: _text,
                          onChanged: (_) => setState(() {}),
                          minLines: 1,
                          maxLines: 3,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(),
                          decoration: const InputDecoration(
                              hintText: 'اكتب رسالة...',
                              border: OutlineInputBorder()))),
                  IconButton.filled(
                      onPressed: _sending ? null : _recordingPath != null ? _toggleRecording : _text.text.trim().isNotEmpty ? _send : _toggleRecording,
                      icon: Icon(_recordingPath != null ? Icons.stop : _text.text.trim().isNotEmpty ? Icons.send : Icons.mic),
                      tooltip: _recordingPath != null ? 'إرسال الصوت' : _text.text.trim().isNotEmpty ? 'إرسال' : 'تسجيل صوت'),
                ]),
              )),
        ]),
      );
}
