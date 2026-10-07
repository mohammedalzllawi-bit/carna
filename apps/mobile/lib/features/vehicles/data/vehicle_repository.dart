import '../../../core/api/api_client.dart';
import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';
import '../domain/vehicle.dart';

class VehicleRepository {
  VehicleRepository(this._client);
  final ApiClient _client;

  Future<Vehicle> detail(String id) async {
    final response =
        await _client.dio.get<Map<String, dynamic>>('/v1/catalog/vehicles/$id');
    return Vehicle.fromJson(response.data!);
  }

  Future<String> startChat(String vehicleId) async {
    final response = await _client.dio.post<Map<String, dynamic>>(
      '/v1/listing-chats',
      data: {'vehicleId': vehicleId},
    );
    return response.data!['id'] as String;
  }

  Future<List<Map<String, dynamic>>> chats() async {
    final response = await _client.dio.get<List<dynamic>>('/v1/listing-chats');
    return (response.data ?? const []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> chat(String id) async {
    final response =
        await _client.dio.get<Map<String, dynamic>>('/v1/listing-chats/$id');
    return response.data!;
  }

  Future<void> send(String id, String body) async {
    await _client.dio
        .post('/v1/listing-chats/$id/messages', data: {'body': body});
  }

  Future<void> sendVoice(String id, String path) async {
    final data = FormData.fromMap({
      'audio': await MultipartFile.fromFile(path,
          filename: 'message.m4a', contentType: MediaType('audio', 'mp4')),
    });
    await _client.dio.post('/v1/listing-chats/$id/voice', data: data);
  }
}
