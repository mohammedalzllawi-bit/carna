class Vehicle {
  const Vehicle({
    required this.id,
    required this.lotNumber,
    required this.make,
    required this.model,
    required this.year,
    required this.saleType,
    required this.category,
    this.trim,
    this.mileageKm,
    this.priceLyd,
    this.city,
    this.imageUrl,
    this.publishedAt,
    this.approvalStatus,
    this.images = const [],
    this.contactPhone,
  });

  factory Vehicle.fromJson(Map<String, dynamic> json) {
    final cityData = json['city'] as Map<String, dynamic>?;
    final auctionData = json['auction'] as Map<String, dynamic>?;
    final auctionPrice = auctionData?['currentBidLyd'] as num?;
    return Vehicle(
      id: json['id'] as String,
      lotNumber: json['lotNumber'] as String,
      make: json['make'] as String,
      model: json['model'] as String,
      trim: json['trim'] as String?,
      year: json['year'] as int,
      mileageKm: json['mileageKm'] as int?,
      saleType: json['saleType'] as String,
      category: json['category'] as String? ?? 'Car',
      priceLyd: (auctionPrice ?? json['priceLyd'] as num?)?.toDouble(),
      city: cityData?['nameAr'] as String?,
      imageUrl: json['imageUrl'] as String?,
      publishedAt: DateTime.tryParse(json['publishedAt'] as String? ?? ''),
      approvalStatus: json['approvalStatus'] as String?,
      images: (json['images'] as List<dynamic>? ?? const [])
          .map((item) => (item as Map<String, dynamic>)['url'] as String)
          .toList(),
      contactPhone: json['contactPhone'] as String?,
    );
  }

  final String id;
  final String lotNumber;
  final String make;
  final String model;
  final String? trim;
  final int year;
  final int? mileageKm;
  final String saleType;
  final String category;
  final double? priceLyd;
  final String? city;
  final String? imageUrl;
  final DateTime? publishedAt;
  final String? approvalStatus;
  final List<String> images;
  final String? contactPhone;

  String get title =>
      '$make $model${trim == null || trim!.isEmpty ? '' : ' $trim'}';
}

const vehicleCategoryLabels = <String, String>{
  'Car': 'سيارات',
  'Truck': 'شاحنات',
  'Motorcycle': 'دراجات نارية',
  'Bicycle': 'دراجات هوائية',
  'Other': 'أخرى',
};

class City {
  const City({required this.id, required this.nameAr});

  factory City.fromJson(Map<String, dynamic> json) => City(
        id: json['id'] as String,
        nameAr: json['nameAr'] as String,
      );

  final String id;
  final String nameAr;
}

class LiveAuction {
  const LiveAuction({
    required this.id,
    required this.vehicle,
    required this.currentBidLyd,
    required this.bidCount,
    required this.endsAt,
  });

  factory LiveAuction.fromJson(Map<String, dynamic> json) => LiveAuction(
        id: json['id'] as String,
        vehicle: json['vehicle'] as String,
        currentBidLyd: (json['currentBidLyd'] as num).toDouble(),
        bidCount: json['bidCount'] as int,
        endsAt: DateTime.parse(json['endsAt'] as String).toLocal(),
      );

  final String id;
  final String vehicle;
  final double currentBidLyd;
  final int bidCount;
  final DateTime endsAt;
}

class HomeData {
  const HomeData(
      {required this.cities, required this.vehicles, this.liveAuction});

  factory HomeData.fromJson(Map<String, dynamic> json) => HomeData(
        cities: (json['cities'] as List<dynamic>)
            .map((item) => City.fromJson(item as Map<String, dynamic>))
            .toList(),
        vehicles: (json['vehicles'] as List<dynamic>)
            .map((item) => Vehicle.fromJson(item as Map<String, dynamic>))
            .toList(),
        liveAuction: json['liveAuction'] == null
            ? null
            : LiveAuction.fromJson(json['liveAuction'] as Map<String, dynamic>),
      );

  final List<City> cities;
  final List<Vehicle> vehicles;
  final LiveAuction? liveAuction;
}
