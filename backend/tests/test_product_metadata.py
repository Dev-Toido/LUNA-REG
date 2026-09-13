"""Metadata extraction checks using the actual Pair-B XML labels."""

from pathlib import Path

from app.services.product_metadata import extract_product_metadata

PAIR_ROOT = Path(r"C:\My sep_stuffs\SIH 2026\Image_Registration_Test\dataset\Pair-B")
OHRC_XML = PAIR_ROOT / "OHRC/data/calibrated/20210405/ch2_ohr_ncp_20210405T0640233469_d_img_d18.xml"
TMC_XML = PAIR_ROOT / "TMC-2/data/calibrated/20211116/ch2_tmc_ncn_20211116T1329461965_d_img_d18.xml"


def test_pair_b_ohrc_metadata_is_extracted_without_invented_values() -> None:
    if not OHRC_XML.is_file():
        return
    metadata = extract_product_metadata(OHRC_XML)
    assert metadata.product_id == "ch2_ohr_ncp_20210405t0640233469_d_img_d18"
    assert metadata.instrument == "OHRC"
    assert metadata.mission == "Chandrayaan-2"
    assert metadata.acquisition_time is not None
    assert metadata.image_width == 12000
    assert metadata.image_height == 93693
    assert metadata.resolution == 0.23
    assert metadata.calibration_status == "Calibrated"
    assert metadata.footprint["upper_left"].latitude == -68.275788


def test_pair_b_tmc_metadata_is_extracted_without_invented_values() -> None:
    if not TMC_XML.is_file():
        return
    metadata = extract_product_metadata(TMC_XML)
    assert metadata.product_id == "ch2_tmc_ncn_20211116t1329461965_d_img_d18"
    assert metadata.instrument == "TMC-2"
    assert metadata.mission == "Chandrayaan-2"
    assert metadata.image_width == 4000
    assert metadata.image_height == 195281
    assert metadata.resolution == 5.13
    assert metadata.footprint["lower_right"].longitude == 71.746794


def test_namespaces_are_supported(tmp_path: Path) -> None:
    xml_path = tmp_path / "namespaced.xml"
    xml_path.write_text(
        """<p:label xmlns:p=\"urn:test\"><p:logical_identifier>urn:test:product-1</p:logical_identifier><p:start_date_time>2024-01-01T00:00:00Z</p:start_date_time><p:Axis_Array><p:axis_name>Line</p:axis_name><p:elements>2</p:elements></p:Axis_Array><p:Axis_Array><p:axis_name>Sample</p:axis_name><p:elements>3</p:elements></p:Axis_Array></p:label>""",
        encoding="utf-8",
    )
    metadata = extract_product_metadata(xml_path)
    assert metadata.product_id == "product-1"
    assert metadata.image_width == 3
    assert metadata.image_height == 2