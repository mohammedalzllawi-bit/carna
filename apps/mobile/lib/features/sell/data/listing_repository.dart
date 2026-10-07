import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/api/api_client.dart';
import '../../vehicles/domain/vehicle.dart';

class ListingRepository {
  ListingRepository(this._api, {this.dealerMode = false});
  final bool dealerMode;
  String get _base => dealerMode ? '/v1/dealer/vehicles' : '/v1/listings';

  final ApiClient _api;

  Future<List<City>> cities() async {
    final response = await _api.dio.get<List<dynamic>>('/v1/catalog/cities');
    return (response.data ?? const [])
        .map((item) => City.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<Vehicle>> mine() async {
    final response = await _api.dio.get<List<dynamic>>('/v1/listings/mine');
    return (response.data ?? const [])
        .map((item) => Vehicle.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Vehicle> create(Map<String, dynamic> data) async {
    final response =
        await _api.dio.post<Map<String, dynamic>>(_base, data: data);
    return Vehicle.fromJson(response.data!);
  }

  Future<void> uploadImages(String id, List<XFile> images) async {
    final files = <MultipartFile>[];
    for (final image in images) {
      final extension = image.name.toLowerCase().split('.').last;
      final mime = extension == 'png'
          ? 'png'
          : extension == 'webp'
              ? 'webp'
              : 'jpeg';
      files.add(await MultipartFile.fromFile(image.path,
          filename: image.name, contentType: MediaType('image', mime)));
    }
    await _api.dio.post<void>(
      '$_base/$id/images',
      data: FormData.fromMap({'images': files}),
      options: Options(contentType: 'multipart/form-data'),
    );
  }

  Future<void> submit(String id) async {
    await _api.dio.post<void>('$_base/$id/submit');
  }
}
