import '../../../core/api/api_client.dart';
import '../../vehicles/domain/vehicle.dart';

final class HomeRepository {
  HomeRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<HomeData> loadHome() async {
    final response =
        await _apiClient.dio.get<Map<String, dynamic>>('/v1/catalog/home');
    final data = response.data;
    if (data == null) throw const FormatException('Empty API response');
    return HomeData.fromJson(data);
  }

  Future<List<Vehicle>> searchVehicles({
    String? query,
    String? make,
    String? model,
    String? category,
    String sort = 'newest',
    DateTime? dateFrom,
  }) async {
    final response = await _apiClient.dio.get<List<dynamic>>(
      '/v1/catalog/vehicles',
      queryParameters: {
        if (query?.trim().isNotEmpty == true) 'q': query!.trim(),
        if (make?.trim().isNotEmpty == true) 'make': make!.trim(),
        if (model?.trim().isNotEmpty == true) 'model': model!.trim(),
        if (category != null) 'category': category,
        'sort': sort,
        if (dateFrom != null) 'dateFrom': dateFrom.toUtc().toIso8601String(),
      },
    );
    return (response.data ?? const [])
        .map((item) => Vehicle.fromJson(item as Map<String, dynamic>))
        .toList();
  }
}
