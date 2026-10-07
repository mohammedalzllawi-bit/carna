import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http_parser/http_parser.dart';
import '../../../core/api/api_client.dart';
import '../../vehicles/domain/vehicle.dart';

class SellVehicleResult {
  const SellVehicleResult({
    required this.vehicleId,
    required this.lotNumber,
    required this.orderId,
    required this.paymentRequired,
    required this.totalLyd,
  });

  final String vehicleId;
  final String lotNumber;
  final String orderId;
  final bool paymentRequired;
  final double totalLyd;
}

class SellVehicleRepository {
  SellVehicleRepository(this._api);

  final ApiClient _api;

  Future<List<City>> loadCities() async {
    final response = await _api.dio.get<List<dynamic>>('/v1/catalog/cities');
    return (response.data ?? const [])
        .map((item) => City.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<SellVehicleResult> createAuctionListing(
      Map<String, dynamic> input) async {
    final response = await _api.dio.post<Map<String, dynamic>>(
      '/v1/auction-listings',
      data: input,
    );
    final data = response.data!;
    final vehicle = data['vehicle'] as Map<String, dynamic>;
    final order = data['order'] as Map<String, dynamic>;
    return SellVehicleResult(
      vehicleId: vehicle['id'] as String,
      lotNumber: vehicle['lotNumber'] as String,
      orderId: order['id'] as String,
      paymentRequired: data['paymentRequired'] as bool? ?? false,
      totalLyd: (order['totalLyd'] as num?)?.toDouble() ?? 0,
    );
  }

  Future<void> uploadImages(String vehicleId, List<XFile> images) async {
    final uploads = <MultipartFile>[];
    for (final image in images) {
      uploads.add(await MultipartFile.fromFile(
        image.path,
        filename: image.name,
        contentType: _imageContentType(image.name),
      ));
    }
    await _api.dio.post<void>(
      '/v1/auction-listings/$vehicleId/images',
      data: FormData.fromMap({'category': 'gallery', 'images': uploads}),
      options: Options(contentType: 'multipart/form-data'),
    );
  }

  MediaType _imageContentType(String filename) {
    final extension = filename.toLowerCase().split('.').last;
    return switch (extension) {
      'png' => MediaType('image', 'png'),
      'webp' => MediaType('image', 'webp'),
      _ => MediaType('image', 'jpeg'),
    };
  }
}
